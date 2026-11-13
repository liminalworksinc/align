# Node-Server-Alignments implementation Flavor

## ADDED Requirements

### Requirement: Node alignment binding [authored:node-server-alignments-v8]

# Applying a work-toward binding uses the loaded goal identity

After completion has checked consent and cycles, loaded the current revision's
session keys and checked conflicting governance, load the target goal through
goalRow and compute goalCore from that loaded row. Iterate the keys and skip a
missing or stopped session before evaluating the binding-write arguments.

For each surviving session's governing-goal UPDATE, read the loaded target
row's id as the first binding, then the alignment row's id, captured time,
alignment row's ws_id and the session key. The stored alignment's target_goal_id
reference is not the source of that first binding. They may hold equal strings,
but the original reads the loaded goal's id at this position.

The subsequent binding_changed directive reads loaded target.id again for its
binding goal_id, and holdNewlyBound reads loaded target.id again for its goal
argument. Do not cache those reads or substitute alignment.target_goal_id.
Retain the existing workspace, alignment identity, directive cause and per-key
effect sequence.

The sixth specification passed two distinct clean qualifications. Its separate
fresh admission was refused for substituting the stored target reference in
this UPDATE. Preserve both successful qualifications and that failed fresh
candidate. No original source, expected result, private case or generated
candidate is changed. This refinement requires a new normal signed promotion,
two clean qualifications and another separate fresh admission.


# Public arguments and requirement identity

These are the positional public interfaces. Preserve the argument order for
external callers, even when choosing a different order for a private helper.

| Public value | Arguments in order | Return |
| --- | --- | --- |
| ACTIONS | ordinary per-instance mutable array | six action strings in the stated order |
| createAlignment | principal, body | Promise of fresh alignment view |
| insertAlignment | principal, target goal row, optional source goal row, choice, session row array, note, time | new alignment id |
| actOnAlignment | principal, alignment id, action, body | Promise of fresh alignment view |
| endAlignmentsToClosedGoal | workspace id, target goal id, actor id, time | undefined |
| getAlignment | principal, alignment id | alignment view |
| listAlignments | principal | waiting_on_me, mine, others |
| assertAction | candidate action string | validated input string |

In particular, insertAlignment's fourth argument is the choice string and fifth
is the session array. The creation transaction invokes that same public order.
External sample and direct insertion callers use it independently. Consistently
swapping these two arguments inside the implementation still breaks that API.

For the public requirement's for field, retain the requirement's original for
identity when the referenced goal is visible. A nonempty goal reference that is
hidden becomes null. A sessions:<user> reference and a falsy reference stay as
specified by their original value. Visibility is read from goalLabel's visible
field; the label's returned id does not replace the requirement identity.

The fifth failed candidate is preserved unchanged. Its remaining frozen
differences were caused by the swapped public insertion arguments. No original
source, private case, expected result, harness or qualified artifact is changed
to accommodate it. Fresh normal generation and complete acceptance are required.


# Alignment service Node binding

Use Node 24 or later on macOS and Linux. Export synchronous arity-one
create_alignments(resources) from server_alignments/create_alignments in a
dependency-free CommonJS package. The regular non-symlink package directory has
exactly create_alignments.js and package.json. The manifest names server_alignments,
uses type commonjs and has exactly
{"./create_alignments":"./create_alignments.js"} as its export map.
Root build and test adapters remain outside this runtime package.

Capture these 32 resources once, in order, without enumeration or service calls:
all, audit, get, run, tx, badRequest, conflict, forbidden, notFound, newId, nowIso,
effectiveSet, goalCore, goalObj, goalRow, parentIds, reviewParents, visibleGoal,
canBind, canReadGoal, writeDirective, holdNewlyBound, openEpoch, sessionRow,
memberName, nameTo, need, assertRevisionReached, oneOf, optStr, revisionRead,
strList. Call supplied functions with undefined receivers. The error factories
return values: throw the exact returned value at each refusal. Preserve a factory's
own thrown value. The principal has wsId, userId and wsRole, including viewer.
There is no replacement role field. No ambient Date lookup is needed.

Return exactly eight values in this order: ACTIONS, createAlignment,
insertAlignment, actOnAlignment, endAlignmentsToClosedGoal, getAlignment,
listAlignments, assertAction. ACTIONS is a live per-instance ordinary array with
approve, counter, accept_counter, reject, withdraw, revoke. Function names and
lengths are createAlignment2, insertAlignment7, actOnAlignment4,
endAlignmentsToClosedGoal4, getAlignment2, listAlignments1, assertAction1.
Only createAlignment and actOnAlignment are async functions. Retain the original
Choice, AlignmentState, AlignmentAction and Requirement TypeScript contracts at
the caller. Runtime construction calls no service.

## Requirement and revision protocols

requirementsFor adds target, optional source, then session owners and the goals
of their open epochs for allocation transfer. De-duplicate by for without merging
sets. Each set is a fresh sorted array from a Set, with approved_by null. Call
effectiveSet with the original requester at the original sites. Read an open epoch
for every listed session in the second allocation pass. Missing bound goals add
no requirement.

requirementsOf parses approvers_json, converts each legacy string to a singleton
requirement and shallow-copies object requirements, defaulting approved_by only
when nullish. In order, fill unsatisfied requirements from the first matching
approval in the query result. Existing approved_by values remain. Flatten and
de-duplicate approvers with the original array/Set/sort operations. recordApproval
first inserts or ignores the approval, rereads current requirements and writes
their JSON back. Do not synthesize an approval audit.

writeRevision inserts the revision, inserts sessions in incoming order and records
the author's approval only if the author is in the requirements' approver union.
Keys are subsequently read in session_key order. Approval history uses at,rowid
order. involved starts with the requester and includes every revision's approvers
in query and insertion order, including legacy rows.

Contribution-cycle detection uses the original stack, seen Set and parentIds
traversal. A match to source is checked before the seen test. It exposes no goal
names in the refusal. Do not substitute dependency-cycle traversal.

## Creation and completion

createAlignment calls need(alignment.create), then visibleGoal for the typed target
or empty string. Check its status before reading optional source. Validate source,
self-reference, canBind(source,false), source status and contribution cycle in
that order. Validate choice, then session_keys through strList(max50,itemMax43).
For each key, sessionRow must exist and belong to the caller, then must not be
stopped. Apply choice-specific empty checks, refuseGoverned for work_toward,
optStr(note,1000), then nowIso. Await tx with a synchronous callback invoking
insertAlignment. Return the view from a fresh alignment row after the transaction.

refuseGoverned reads every key and retains those with a nonempty different
governing_alignment_id. Distinguish all affected sessions following this target
from any following another goal. The singular same-target sentence applies only
when all listed keys are governed and exactly one key was supplied.

insertAlignment obtains newId(al), writes the pending row at revision1, writes
the first revision using sessions.map(session_key) and requirementsFor, audits
alignment.requested, rereads the row and calls maybeApprove, then returns the id.
It owns no transaction. Preserve this synchronous path for sample seeding.

maybeApprove reads the revision first, then current requirements; return false if
any requirement lacks approved_by. Check the contribution cycle before reading
keys. For work_toward, refuse conflicting governance, read target and goalCore
once, then read each session. Skip missing or stopped sessions entirely. Otherwise
update governance, write one binding_changed directive for that key, then call
holdNewlyBound. Binding fields are goal_id, effective next_root_turn, cause
alignment:<id>. After all sessions, update the alignment to approved, call
reviewParents for a source with target id, audit alignment.approved and return true.

## Actions and prospective ending

actOnAlignment first uses visibleAlignment, refuses a viewer, calls revisionRead,
captures userId and nowIso, then awaits tx. Inside, reread the row; call
assertRevisionReached before checking concurrent state/revision against the
outside row. That concurrent mismatch uses its own stale_revision sentence.
Read revision and current requirements and compute requester and approver flags.
Each action checks state before seen-revision equality. Preserve every factory,
message, body read and short circuit from the original.

Approve requires pending, current revision and approver, then active goals. Record
approval, update time and maybeApprove. Counter requires pending and current
revision and an approver other than requester, then active goals. Read previous
keys, optional choice, then keep if it is an array, otherwise optional session_keys.
Every keep element must be an in-range integer. Keep retains original order and
does not duplicate a key. Refuse new keys, invalid empty work_toward and empty
contribution without source. Missing session rows are filtered before recomputing
requirements. Write the new revision with note validated at its original call
site, update countered state and revision and audit.

Accept-counter requires countered, current revision and requester, then active
goals. Record requester approval only when eligible. Write pending before
maybeApprove using a shallow row copy with state pending. Reject permits pending
or countered and an approver other than requester. Withdraw permits those states
and requester only. Revoke requires approved and requester or approver; write
revoked fields before ending work_toward governance, then audit. No default action
branch adds an effect. Return a fresh view after transaction success.

refuseClosedGoals examines target then source. Missing rows are skipped; an
inactive existing row is refused. A readable goal's title is quoted; an unreadable
one is unnamed. Decline, withdrawal and revocation do not call this guard.

endGovernance clears governance on all sessions of that alignment. Query open
epochs with authority alignment and that alignment id. For every returned key,
end its open epoch, then change only shared session state to suspended. Call
writeDirective once with the whole suspended array, including an empty array,
null goal and the original binding fields. The directive owner suppresses an
empty-target directive. endAlignmentsToClosedGoal reads approved rows for the
target, skips every non-work_toward revision, ends governance with
goal_closed:<alignment id> and audits each with the supplied actor and time.

## Read identity, privacy and ordering

visibleAlignment loads by ws,id and throws notFound if absent, then calls
need(alignment.read,{kind:alignment,involved:...}). State-refusal helpers retain
their exact additional SQL/person reads, including counter author and revoker.

The view reads revision, requirements, approver union, approval Set, keys, target
and source, then session projections in that order. Missing sessions are filtered
after mapping. Each surviving projection keeps ref, own-only session_key, owner,
own title/repo/harness label or privacy-safe other-person label, started_at,
key_end of six characters, and visible current_goal from openEpoch. Preserve
native map/filter evaluation and calls even when a later getter fails.

Read following governance only for an approved alignment with governing_goal
effect. Read current target status separately. Derive effect text with the
original singular/plural, zero, partial, moved-session and closed-goal branches.
goalsOpen checks target then source with every and the original short circuit.
Action flags use the same state, requester, approver and open-goal predicates;
clear every flag for viewer. waiting_on_me is approve or accept_counter.
Closed actor lookup depends on state. History is ordered by revision. Requirement
for fields hide unreadable goal ids while retaining sessions:<user> references.
Preserve return-field order, repeated goal/person reads, nulls and references.

getAlignment uses visibleAlignment. listAlignments queries updated_at descending,
filters involved membership, maps views, then filters waiting_on_me, mine and
others separately. assertAction uses live ACTIONS.includes and throws supplied
notFound for every other value.

The 28 exact SQL programs, dispatch ports and placeholder counts are included
below and statically reconciled against the complete source AST. Binding value
order follows the operation descriptions. Private acceptance must still exercise
every call site, argument read and failure position before normal promotion.
Private acceptance must compare complete results, errors, resource and input
reads, effects, rollback, aliases and per-runtime native iteration behaviour to
the original. Do not reduce it to success-only state snapshots.


# Alignment projection and wording supplement

Preserve these projection fields and exact wording with the evaluation order
from the binding contract.

## View fields

Return these keys in order: id, state, revision, choice, requester, target_goal,
source_goal, sessions, effects, requirements, approvers, note, history,
waiting_on_me, can, closed_by, closed_at, created_at, updated_at.

requester is {id,name}. A missing source label is null. Each existing goal label
is {id,title,visible}; unreadable or missing goal rows give
{id:null,title:null,visible:false}. Named labels quote the visible title, otherwise
use `a goal you can't see`.

Each surviving session has keys ref, session_key, owner, label, started_at,
key_end, current_goal, in that order. owner is {id,name}. session_key is the full
key only for its owner, otherwise null. The owner's label uses title, then
repo_alias, then `<harness> session`. Another person's label is
`<repo_alias> (<harness>)` when repo_alias is truthy, otherwise
`a <harness> session`. ref is its index before missing rows are filtered; do not
renumber surviving rows. key_end is the last six characters. current_goal uses
the session's open epoch and the same private-safe goal label.

effects is the ordered effects_json array mapped to {kind,text}. requirements
maps to {for,approvers,approved_by}. Hide a non-sessions for id unless its goal is
visible, using null. Keep sessions:<person> references. Each approver is {id,name};
approved_by is that shape or null. Apply the hidden-for lookup only to a truthy
for value that does not start with sessions:. Keep falsy original for values
unchanged. The distinct sorted approver union maps to
{id,name,approved}, where approved is membership in the current approval Set.

history contains {revision,choice,author,note,created_at} in revision query order;
author is {id,name}. can has approve,counter,reject,accept_counter,withdraw,revoke
in that order. waiting_on_me is can.approve or can.accept_counter. closed_by is
the declining audit actor, withdrawing requester, or revoked_by, mapped to
{id,name} when truthy, otherwise null. closed_at is revoked_at for revoked,
decided_at for rejected or withdrawn, otherwise null.

## Effect wording

Let N be the number of surviving session projections, F the number still
governed by this alignment, and G=N-F. `who` is `this session` for N=1, otherwise
`these <N> sessions`. Capitalize its first character only where shown below.
Use the private-safe named goal labels, including their quotes.

The contributes_to effect is `Records that <subject> to <target>.` The subject is
`<source> contributes` when source_goal_id is truthy, otherwise
`this session contributes` for N=1 or `these <N> sessions contribute`.
Append ` No usage moves.` only when allocation_transfer is absent.

For an approved alignment with an existing inactive target, governing_goal says
`This session no longer follows <target>: that goal was <status>.` for N=1, or
`These <N> sessions no longer follow <target>: that goal was <status>.` otherwise.
allocation_transfer says `Future usage from <who> no longer counts under
<target>: that goal was <status>. Past usage stays where it is.`

Otherwise, governing_goal uses the following exact branches:

| Condition | Text |
| --- | --- |
| G=0, N=1 | This session follows <target>: its agent gets that goal and its changes. |
| G=0, N is not 1 | These <N> sessions follow <target>: their agents get that goal and its changes. |
| G is nonzero, F=0, N=1 | This session no longer follows <target>: it moved to another goal or stopped sharing. |
| G is nonzero, F=0, N is not 1 | These <N> sessions no longer follow <target>: they moved to another goal or stopped sharing. |
| G is nonzero, F=1 | 1 of these <N> sessions still follows <target>: its agent gets that goal and its changes. The other <G> moved to another goal or stopped sharing. |
| G is nonzero, F is nonzero and not 1 | <F> of these <N> sessions still follow <target>: their agents get that goal and its changes. The other <G> moved to another goal or stopped sharing. |

allocation_transfer uses `Future usage from <who> counts under <target>. Past
usage stays where it is.` when G=0; `Future usage from <who> no longer counts
under <target>. Past usage stays where it is.` when G is nonzero and F=0;
otherwise `Future usage from the <F> still following counts under <target>. Past
usage stays where it is.` Do not infer F from epoch ownership. The main contract
specifies the governance rereads and when F instead equals N.

## Dynamic refusals

The contribution-cycle message is exactly `Approving this would make these goals
contribute to each other in a loop.`

Inactive-goal action refusals use `<what> was <status> after the request was made,
<why>. Decline or withdraw this request instead.` For a readable goal, what is
its quoted title; otherwise `A goal in this request`. Target why is
`so nothing can align with it`; source why is
`so it can't contribute to another goal`.

For an already governed same-target session, use `This session already follows
this goal through an alignment, so there is nothing to change.` only when exactly
one key was supplied and all listed keys were governed. Otherwise, when every
governed row follows the target, use `One of these sessions already follows this
goal through an alignment; leave it out.` If a governed row follows another goal,
use `One of these sessions already follows another goal through an alignment;
revoke that one first.`

State refusals are:

| State | Text |
| --- | --- |
| pending | This request is waiting for approval. |
| countered, reader is counter author | You countered this request; it waits on <requester as nameTo> to accept it. |
| countered, other reader | An approver suggested a change to this request; it waits on <requester as nameTo> to accept it. |
| approved | This request is already approved. |
| rejected, reader is latest declining audit actor | You declined this request, so nothing changes. |
| rejected, other reader | This request was declined<by>, so nothing changes. |
| withdrawn, reader is requester | You withdrew this request, so nothing changes. |
| withdrawn, other reader | This request was withdrawn by <requester memberName>, so nothing changes. |
| revoked, reader is current revoked_by lookup | You revoked this alignment. |
| revoked, other reader | This alignment was revoked<by>. |

In declined/revoked other-reader messages, by is ` by <memberName>` only for a
truthy actor id, otherwise empty. The revocation refusal performs its dedicated
revoked_by query. A counter's revision refusal uses its author through nameTo:
`This request changed after you read it: <author as nameTo> countered it, and it
is now at revision <revision>. Read it again and decide again.` Without a truthy
counter author, use `This request changed after you read it: it is now at revision
<revision>. Read it again and decide again.`

The transaction's initial concurrent-state/revision mismatch instead says
`This request changed while your decision was being sent. Read it again and
decide again.` Unknown-revision wording and validation errors remain supplied
by assertRevisionReached and the validation resources, at their specified sites.
Do not duplicate those implementations.


## Exact SQL and direct refusal argument data

The following data is part of this draft binding. SQL bytes, dispatch port and
binding counts are exact, including the newline in the change-request insertion.
Binding value order follows the operation descriptions above. Direct refusal
arguments are literal strings passed to the named supplied factory and thrown.
Dynamic refusals use the preceding wording rules. No original business function
body is included here.

```json
{
  "SQL": [
    {
      "id": "Q01",
      "port": "run",
      "bindings": 9,
      "sql": "INSERT INTO v2_alignment_revisions (ws_id, alignment_id, revision, choice, effects_json, approvers_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    },
    {
      "id": "Q02",
      "port": "run",
      "bindings": 4,
      "sql": "INSERT INTO v2_alignment_sessions (ws_id, alignment_id, revision, session_key) VALUES (?, ?, ?, ?)"
    },
    {
      "id": "Q03",
      "port": "get",
      "bindings": 2,
      "sql": "SELECT * FROM v2_alignment_revisions WHERE alignment_id = ? AND revision = ?"
    },
    {
      "id": "Q04",
      "port": "all",
      "bindings": 2,
      "sql": "SELECT user_id FROM v2_alignment_approvals WHERE alignment_id = ? AND revision = ? ORDER BY at, rowid"
    },
    {
      "id": "Q05",
      "port": "run",
      "bindings": 5,
      "sql": "INSERT OR IGNORE INTO v2_alignment_approvals (ws_id, alignment_id, revision, user_id, at) VALUES (?, ?, ?, ?, ?)"
    },
    {
      "id": "Q06",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_alignment_revisions SET approvers_json = ? WHERE alignment_id = ? AND revision = ?"
    },
    {
      "id": "Q07",
      "port": "all",
      "bindings": 2,
      "sql": "SELECT session_key FROM v2_alignment_sessions WHERE alignment_id = ? AND revision = ? ORDER BY session_key"
    },
    {
      "id": "Q08",
      "port": "all",
      "bindings": 2,
      "sql": "SELECT user_id FROM v2_alignment_approvals WHERE alignment_id = ? AND revision = ?"
    },
    {
      "id": "Q09",
      "port": "all",
      "bindings": 1,
      "sql": "SELECT approvers_json FROM v2_alignment_revisions WHERE alignment_id = ?"
    },
    {
      "id": "Q10",
      "port": "run",
      "bindings": 5,
      "sql": "UPDATE v2_sessions SET governing_goal_id = ?, governing_alignment_id = ?, updated_at = ? WHERE ws_id = ? AND session_key = ?"
    },
    {
      "id": "Q11",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_alignments SET state = 'approved', decided_at = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q12",
      "port": "run",
      "bindings": 7,
      "sql": "INSERT INTO v2_alignments (id, ws_id, requester_id, target_goal_id, source_goal_id, state, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?)"
    },
    {
      "id": "Q13",
      "port": "get",
      "bindings": 2,
      "sql": "SELECT * FROM v2_alignments WHERE ws_id = ? AND id = ?"
    },
    {
      "id": "Q14",
      "port": "get",
      "bindings": 3,
      "sql": "SELECT actor_id FROM v2_audit WHERE ws_id = ? AND object_id = ? AND action = ? ORDER BY at DESC LIMIT 1"
    },
    {
      "id": "Q15",
      "port": "get",
      "bindings": 1,
      "sql": "SELECT revoked_by FROM v2_alignments WHERE id = ?"
    },
    {
      "id": "Q16",
      "port": "run",
      "bindings": 2,
      "sql": "UPDATE v2_alignments SET updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q17",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_alignments SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q18",
      "port": "run",
      "bindings": 2,
      "sql": "UPDATE v2_alignments SET state = 'pending', updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q19",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_alignments SET state = 'rejected', decided_at = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q20",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_alignments SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q21",
      "port": "run",
      "bindings": 4,
      "sql": "UPDATE v2_alignments SET state = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q22",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_sessions SET governing_goal_id = NULL, governing_alignment_id = NULL, updated_at = ? WHERE ws_id = ? AND governing_alignment_id = ?"
    },
    {
      "id": "Q23",
      "port": "all",
      "bindings": 2,
      "sql": "SELECT session_key FROM v2_epochs WHERE ws_id = ? AND ends_at IS NULL AND authority = 'alignment' AND alignment_id = ?"
    },
    {
      "id": "Q24",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_epochs SET ends_at = ? WHERE ws_id = ? AND session_key = ? AND ends_at IS NULL"
    },
    {
      "id": "Q25",
      "port": "run",
      "bindings": 3,
      "sql": "UPDATE v2_sessions SET state = 'suspended', updated_at = ? WHERE ws_id = ? AND session_key = ? AND state = 'shared'"
    },
    {
      "id": "Q26",
      "port": "all",
      "bindings": 2,
      "sql": "SELECT * FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved'"
    },
    {
      "id": "Q27",
      "port": "all",
      "bindings": 1,
      "sql": "SELECT * FROM v2_alignment_revisions WHERE alignment_id = ? ORDER BY revision"
    },
    {
      "id": "Q28",
      "port": "all",
      "bindings": 1,
      "sql": "SELECT * FROM v2_alignments WHERE ws_id = ? ORDER BY updated_at DESC"
    }
  ],
  "direct_literal_refusal_arguments": [
    {
      "factory": "notFound",
      "arguments": []
    },
    {
      "factory": "conflict",
      "arguments": [
        "sharing_stopped",
        "One of these sessions is no longer shared, so it can't be part of an alignment."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "already_governed",
        "One of these sessions already follows another goal through an alignment; revoke that one first."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "goal_not_active",
        "That goal is achieved or dropped, so nothing can align with it."
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "A goal can't align with itself"
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "source_not_yours",
        "The source goal must be yours or your team's."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "goal_not_active",
        "Your goal is achieved or dropped, so it can't contribute to another goal."
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "Pick at least one of your shared sessions to work toward this goal"
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "Pick a goal of yours or at least one session that contributes"
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "read_only",
        "Viewers can look but not change anything."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "stale_revision",
        "This request changed while your decision was being sent. Read it again and decide again."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_an_approver",
        "Your approval is not needed on this request."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_an_approver",
        "Only an approver can suggest a change."
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "keep must list session refs from this revision"
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "A counter can only keep or remove sessions from the request"
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "Working toward a goal needs at least one session"
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "Keep at least one session or the source goal"
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_requester",
        "Only the person who asked can accept a suggested change."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_an_approver",
        "Only an approver can decline."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_requester",
        "Only the person who asked can withdraw."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_an_approver",
        "Only the person who asked or an approver can revoke."
      ]
    }
  ]
}
```


# Exact consuming-service ABI and stored rows

These are the supplied resource interfaces. Pass exactly these arguments in
exactly this order with undefined receivers. Do not infer an alternate interface
from a helper's name, add a principal or time parameter, exchange keys and kinds,
or rename stored fields. This table supplements the previously described
behaviour without changing it.

| Resource | Exact arguments |
| --- | --- |
| all | SQL string, followed by positional bind values |
| get | SQL string, followed by positional bind values |
| run | SQL string, followed by positional bind values |
| audit | workspace id, actor id, action string, object id, time; exactly five |
| tx | one synchronous callback, awaited only by createAlignment and actOnAlignment |
| badRequest | message |
| conflict | code, message |
| forbidden | code, message |
| notFound | no arguments |
| newId | the literal al |
| nowIso | no arguments |
| effectiveSet | goal row, original requester id; exactly two |
| goalCore | goal row |
| goalObj | goal row |
| goalRow | workspace id, goal id |
| parentIds | workspace id, goal id |
| reviewParents | workspace id, source goal id, time, target goal id; exactly four |
| visibleGoal | principal, goal id |
| canBind | principal, result of goalObj(source row), literal false |
| canReadGoal | principal, result of goalObj(goal row) |
| writeDirective | workspace id, kind string, session-key array, opaque goalCore result or null, binding object; exactly five |
| holdNewlyBound | workspace id, target goal id, session key; exactly three |
| openEpoch | workspace id, session key |
| sessionRow | workspace id, session key |
| memberName | person id; exactly one |
| nameTo | person id, reader id; exactly two |
| need for creation | principal, literal alignment.create |
| need for reading | principal, literal alignment.read, object with kind alignment and involved person-id array |
| assertRevisionReached | literal request, seen revision, current revision; exactly three |
| oneOf | original body object, literal choice, array contribution then work_toward |
| optStr for source | original body object, literal source_goal_id, number64 |
| optStr for note | original body object, literal note, number1000 |
| revisionRead | original body object; exactly one |
| strList | original body object, literal session_keys, object with max50 and itemMax43 |

Choice names are contribution and work_toward. contributes_to is an effect kind
and is never the contribution choice name. effectsOf returns a new one-element
contributes_to array only for exact choice contribution; otherwise it returns
contributes_to,governing_goal,allocation_transfer. Governance effects are applied
only for exact revision choice work_toward.

A stored Requirement has exactly the protocol fields for,set,approved_by. set
is the person-id array. The public view's approvers field is a projection of set;
it does not change the stored property name to approvers. Legacy strings become
{for:null,set:[person id],approved_by:null}. approved_by defaults only when
nullish. First-satisfier selection uses each requirement's set.includes.

Goal rows use id,ws_id,title,status,version and owner_id where relevant; retain
other supplied properties unchanged. Session rows use session_key,ws_id,user_id,
state,governing_goal_id,governing_alignment_id,title,repo_alias,harness,started_at
and updated_at. The session owner field is user_id. Session rows have no owner_id
substitute. Epochs use goal_id and may be missing. Treat other supplied fields as
opaque. The principal remains wsId,userId,wsRole.

requirementsFor adds session-owner singleton requirements only inside the
allocation-transfer branch, followed by a second pass over those sessions for
open-epoch goal requirements. Do not add session owners for contribution-only
revisions. Each source or target effective set is obtained with the exact
two-argument interface above. The original requester is preserved during a counter.

For binding_changed, writeDirective's arguments are workspace, binding_changed,
[session key], the one captured goalCore result, and
{goal_id:target.id,effective:next_root_turn,cause:alignment:<id>}. Immediately
afterward call holdNewlyBound(workspace,target.id,session key). No time argument
or nested goal property is added. On prospective ending, call writeDirective
with workspace,binding_suspended,the complete suspended-key array,null and
{goal_id:alignment.target_goal_id,effective:next_root_turn,cause}. Preserve that
call for an empty key array. It is the directive resource that suppresses an empty
target write. The time still belongs to SQL and audit calls at their stated sites.

## Refusal and body-read identities

The contribution-cycle code is cycle. Wrong-state refusals use wrong_state.
Do not replace them with contribution_cycle or alignment_state. Every error
factory result is thrown. Do not add extra audit arguments or wrap a returned
error in another class.

Creation always calls optStr(body,source_goal_id,64), even for an absent or falsy
source field, before deciding whether to read a source goal. For a counter, only
choice exactly undefined retains the revision choice. A null choice is sent to
oneOf and can be refused. Only session_keys exactly undefined skips strList when
keep is not an array. Null is validated, not treated as absent. The keep branch
retains the native every validation, followed by filtering previous keys in their
original order. Target and optional source rows are read before the contribution
empty check and before mapping surviving session rows.

goalLabel returns null immediately for any falsy id, without a goalRow call. A
truthy missing or unreadable goal returns the invisible object. Both labels and
closed-goal refusals use goalObj before canReadGoal. nameTo receives id then
reader, and memberName never receives workspace as an extra argument.

## Projection evaluation sequence

Preserve this sequence before the view's object return:

1. Read current revision, current requirements through their separate revision
   and ordered-approval queries, approver union, approved-person Set, keys,
   target label and source label, then session projections.
2. Compute who, parse effect kinds, and compute following with keys.filter over
   sessionRow(...)? .governing_alignment_id. Do not replace that with a map plus
   another filter. Capture gone. Read current target row. Capture closed as the
   target status string or null, retaining its original short circuits and
   status reads. Then capture movesUsage from kinds.includes(allocation_transfer).
3. Construct effect projections using those captured values and the specified
   native map, includes, property reads and wording. Other effect kinds follow
   the allocation-transfer text branch; do not return undefined text for them.
4. Capture me from pp.userId once, requester and approver flags, then goalsOpen
   with every over [target_goal_id,source_goal_id]. A falsy id passes without a
   lookup; a truthy missing goal fails because its optional status is not active.
   Do not filter ids first, regard missing goals as active, or reread pp.userId
   separately for every can field.
5. Build can in the stated field order and clear it for a viewer. Compute the
   closing actor. Query and map all revision history now, before evaluating the
   returned object's first id field or any requester memberName lookup.
6. Return the specified nineteen fields in order, using the already captured
   history. Session keys in the projection come from s.session_key, not the query
   key variable. Preserve ref positions and the user_id owner check.

The list's mine group requires requester.id equal to pp.userId and a false
waiting_on_me. The others group requires an unequal requester and a false
waiting_on_me. Evaluate each in that left-to-right order with native filter.
An item waiting on the reader is in neither of those groups.


# Stored requirements, action flags and observable evaluation

Keep the original protocols below, including calls and reads that appear
redundant. Supplied rows, arrays, principals and validators may expose getters or
throw at an individual access. A successful value alone does not establish
equivalence when a read, transaction, refusal or rollback moves.

## Requirement loading and primitive identity flow

The requirement formatter takes a revision-like object and an already-loaded
approval-row array. First bind JSON.parse(revision.approvers_json) to raw, then
call raw.map. This retains the native failure text for non-array legacy data.
Each legacy string becomes {for:null,set:[string],approved_by:null}. Other
entries are shallow-spread with approved_by defaulted by nullish coalescing.
For each requirement, a falsy approved_by causes assignment of the first matching
approval's user_id, or null if no approval matches. The test is falsiness, not
equality with null.

currentRequirements receives primitive id and revision values. It loads the
revision row first, the ordered approval rows second, and only then invokes the
formatter. In particular, even malformed approvers_json is parsed after the
ordered approval query. Loading/parsing a revision before that second query
changes failure positions. Do not move lookups into the formatter.

Use primitive identity arguments for the internal query and write helpers:
revisionOf(id,revision), approvalRows(id,revision),
currentRequirements(id,revision), keysOf(id,revision),
approvalsOf(id,revision), recordApproval(workspace,id,revision,user,time).
recordApproval inserts-or-ignores, formats the current requirements through the
query sequence just specified, then writes JSON using its already received
primitive id/revision. Passing a supplied row instead and rereading its id,
workspace or revision on each statement changes the protocol.

involved begins with the requester. For every revision row returned by its one
query, use the same formatter with an empty approval array, then the same
de-duplicated sorted approver union, adding each id to the outer Set. Directly
iterating parsed JSON and reading set skips the formatter's native reads and
failure behaviour. Keep the shared normalizer for legacy and malformed rows.

For the allocation requirement pass, each session-owner singleton uses
sessions:<s.user_id> and a separate s.user_id read for its set. In the second
pass, call openEpoch(s.ws_id,s.session_key). Read epoch?.goal_id to decide whether
to look up its goal, then read s.ws_id and epoch.goal_id again for goalRow.
An existing epoch with a falsy goal id does not cause a goal lookup. The supplied
session's workspace field is read at those sites; a cached request workspace is
not a substitute for those reads.

## Creation, revision writing and decisions

After validating the session-key list for creation, capture pp.userId once as
the owner argument for mapping sessions. Each session lookup reads pp.wsId and
the key, but the ownership comparison uses that captured owner id. Return the
validated session array. Choice-specific empty checks use sessions.length,
not the possibly supplied/proxied key array's length. The contribution test
checks choice, then empty sessions, then absence of source in that order.

The revision writer receives only a plain {id,ws} reference plus the primitive
revision, choice, keys, requirements, note, author and time. On initial insertion,
the public operation reads identity and target/source fields for the INSERT,
then reads workspace for that minimal revision reference. Evaluate the session
key map before the requirements computation and its requester read. After
revision writing, audit the request, reread the inserted alignment using fresh
principal workspace, and call completion. Constructing a synthetic full
alignment row adds extra principal and goal-field reads and is not equivalent.

When completing an alignment, read the revision, then current requirements.
Require every approved_by. Only if a.source_goal_id is truthy evaluate the
contribution-cycle call, whose arguments then read a.ws_id, a.source_goal_id and
a.target_goal_id in that order. Calling a guarded cycle helper unconditionally
still evaluates those argument getters and changes the protocol. Read keys next.

The transaction's initial concurrent guard compares current revision against
the outside revision first, then state against outside state only if necessary.
Keep this order after assertRevisionReached and before reading current revision
and requirements. Capture requester and approver booleans once.

Wrong-state and stale-revision wording helpers receive the already captured
reader id, not the whole principal. A counter author is obtained through the
stated revision lookup; nameTo receives that id and captured reader. They do not
reread pp.userId. Each helper makes one current-counter-author lookup only while
the alignment is countered. Other states do not perform that author lookup.

For a counter, Array.isArray reads body.keep once. If true, read body.keep again
to call its native every validation. Then every previous-key filter callback
reads body.keep again for includes(index). Do not cache keep. New-session refusal
uses keys.some, with previous.includes evaluated at each callback. The
contribution-empty check is choice then !keys.length then !source, in that order.
Read target and optional source before that check, map surviving sessions after
it, and then capture the primitive next revision. Do not spread the supplied
alignment row into a next-row object for this path. A shallow row copy belongs
only to accept_counter's completion call after the pending-state write.

Revocation's suspension cause is exactly alignment:<alignment id>. It is never
revoked:<alignment id>. Goal closing uses goal_closed:<alignment id>. Both use
the binding_suspended kind with the original target goal id retained in binding.

## Session and person projection reads

For each key, load the session and skip a missing row. Capture mine from
s.user_id===pp.userId once. Then capture openEpoch(a.ws_id,key) before evaluating
any returned session field. Do not read s.session_key as that lookup's argument.
The returned fields keep ref, own-only session_key, owner, label, started_at,
key_end and current_goal in that order. label reuses captured mine. current_goal
uses the captured epoch's optional goal_id with nullish fallback to null.

Retain separate supplied-row reads for each person projection: requester reads
a.requester_id for id, then reads it again for memberName; session owner reads
s.user_id for id, then again for memberName; revision author reads author_id for
id, then again for memberName. A person helper invoked with a previously read
primitive elides those row getters. Person ids already held as local primitives
can still be used directly where the original does so.

For following sessions, retain the native keys.filter callback with optional
session-row access and a fresh a.id read in the equality. Compute closed as the
actual target status string or null, not a boolean, at the previously specified
position. Keep movesUsage captured before effect mapping. Use captured me in
the action flags below, and read each a.state field at its specified test.

| Flag | Left-to-right predicate |
| --- | --- |
| approve | state pending, isApprover, not approved.has(me), goalsOpen |
| counter | state pending, isApprover, not isRequester, goalsOpen |
| reject | state pending or state countered, isApprover, not isRequester |
| accept_counter | state countered, isRequester, goalsOpen |
| withdraw | state pending or state countered, isRequester |
| revoke | state approved, isRequester or isApprover |

The already-approved-person exclusion is required even when the alignment is
still pending on another requirement. Its requester must not be queued to
approve again after their own consent was recorded. For viewer, clear the six
flags in Object.keys order. waiting_on_me is approve or accept_counter.

History is fully queried and mapped before the returned object's first field,
as stated in the earlier projection sequence. Its author objects retain the
separate author_id reads above. The closing actor is captured before history.
Requirement and approver projection then happens in the nineteen-field return
order. Keep plain/falsy for values unchanged when the conditional hide test
does not apply. No private field, lookup, query or native failure is replaced by
an approximation.


# Row identity, counter author reads and successful action validation

The active-goal guard after the action's permission and revision checks obtains
both target and source identities from the current alignment row. Its goal
lookup reads that row's ws_id for each nonempty goal identity. The principal
workspace is not read here. Build the target/source pair first, then iterate
it. The principal remains the argument to canReadGoal. That distinction holds
even when the two workspace strings have equal values.

The shared counter-author helper first reads the alignment's state. Only a
countered state reads id and revision and queries that revision's author_id.
Wrong-state wording first switches on state, then uses this helper in the
countered branch, which performs another state read. Stale-revision wording
uses the same helper. Retain its state check when the caller already knows the
state. Do not replace it with an unconditional author lookup.

When a completed work-toward alignment checks existing governance, evaluate
these arguments from left to right: row ws_id, the already held keys, row id,
row target_goal_id. The internal governance guard's third parameter is the
alignment identity to exclude and its fourth is the target goal identity.
Creation supplies null for the alignment identity. Reordering the supplied row
field reads changes exception positions even if the helper accepts reordered
parameters and the final values are equal.

The successful assertAction operation returns its validated input string.
Invalid input throws the supplied notFound result. Returning undefined for a
valid input breaks callers that forward this validation result.

These requirements preserve the original service contract. The previous three
generated candidates and every failed observation remain intact. The frozen
4,104 original records, 28 behavior mutations and 42 exact private commands
remain unchanged. Passing the next qualification still requires fresh normal
generation and the complete acceptance sequence.


# Action state membership reads once

Each action's state guard reads the current alignment's state exactly once and
checks that value against its allowed-state list. Approve and counter allow
pending; accept_counter allows countered; reject and withdraw allow pending or
countered; revoke allows approved. Use the captured list membership result to
decide whether to invoke state-refusal wording. In particular, rejecting or
withdrawing a countered or closed request does not read state separately for
each allowed value. Native allowed-list includes with one row.state argument
preserves this behavior. The later stale-revision check follows this guard.

This action protocol differs from the public view's can predicates, whose
separate short-circuit state reads remain as already specified. Preserve both
protocols at their respective sites.

The current-counter-author helper, after reading state and determining it is
countered, loads the required current revision and reads author_id directly.
It does not turn a missing required revision into undefined through optional
chaining. Other states return null before any author lookup.

The fourth candidate matched 4,084 of the 4,104 frozen records. Its twenty
remaining failures were in the action-state read protocol. That candidate is
preserved and remains inadmissible. The original source, private input corpus,
expected results and all behavior mutations remain unchanged. The next candidate
must pass normal fresh qualification and every later acceptance gate.

# Closed-target status is computed once at its original read site

The view loads the current target row after calculating following and gone.
Then compute its closed status by first reading alignment.state and testing
whether it equals approved. Only when that succeeds, test the loaded target row
for truthiness. Only when that succeeds, read target.status and compare it with
active. When the target is closed, read target.status again for the stored
closed value; otherwise store null.

Keep that exact short-circuit order before computing movesUsage and mapping the
effect kinds. A pending, countered or terminal alignment still reads its state
at this position and does not read the target status here.

The governing-goal and allocation-transfer effect branches subsequently test
only the computed closed value. Do not move the approved-state predicate into
those branches or repeat alignment.state there. Repeating it can change the
observed value, failure position and read count, even if an ordinary immutable
row produces the same words.

All prior target loading, source privacy, requirement identity, effect wording,
function signatures and resource positions stay in force. The seventh intent
passed two clean qualifications, but its separate fresh admission moved this
state predicate into the effect branches. That generated source remains
preserved. A private in-memory diagnostic of these read sites matches all 4,104
frozen original records and is not an admitted candidate. A new signed intent,
two clean generations and separate fresh admission remain required.


#### Scenario: Record goal consent and prospective alignment effects with original private-safe views

- **WHEN** the Node alignment target is selected
- **THEN** Capture32 resources and preserve8 runtime values,4 caller types and28 exact SQL interfaces. Preserve distinct effective approval requirements, requester and revision-author consent, legacy singleton arrays, first satisfying approver, active-goal and contribution-cycle guards, source/session ownership, work-toward governance, binding directives and newly bound holds, parent reviews, six revision-bound actions, counter keep/remove rules, prospective revocation and goal-close suspension, shared versus stopped sessions, hidden goal and full session-key privacy, current effect wording, decision history, caller-owned transactions and exact read/effect/failure order. No ambient clock or IO.
