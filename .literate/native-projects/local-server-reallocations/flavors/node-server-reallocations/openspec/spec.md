# Node-Server-Reallocations implementation Flavor

## ADDED Requirements

### Requirement: Node target reallocation binding [authored:node-server-reallocations-v1]

# Reallocation Node binding

Use Node24 or later on macOS and Linux. Export synchronous arity-one
create_reallocations(resources) at server_reallocations/create_reallocations in
the dependency-free CommonJS package server_reallocations. The regular,
non-symlink package directory contains exactly two regular, non-symlink files:
create_reallocations.js and package.json. Its manifest has name
server_reallocations, type commonjs and exactly the export map
{"./create_reallocations":"./create_reallocations.js"}. No declarations, maps,
tests or other members belong inside that directory. Build/test adapters may be
outside it. The caller retains ReallocationState, ReallocationAction and
ReallocationView, including its original structural public type.

Capture these26 resources once, in order, without enumeration or service calls:
all,audit,get,run,tx,badRequest,conflict,forbidden,notFound,newId,nowIso,
effectiveSet,launchSet,assertTargetsFit,contentOf,goalObj,goalRow,visibleGoal,
writeGoalVersion,canReadGoal,memberName,nameTo,assertRevisionReached,optStr,
revisionRead,COUNTER_SAME_AS_PROPOSAL.
Invoke supplied service functions with undefined receivers and propagate their
exact thrown values or rejected values. Transactions belong to tx. Supply it a
synchronous callback, await its result in create and act, and keep each write and
audit in its original transaction position. No service call runs at construction.

Return exactly these nine values in order: REALLOCATION_STATES,
REALLOCATION_ACTIONS,REALLOCATION_GOALS_MAX,createReallocation,
actOnReallocation,supersedeReallocations,getReallocation,listReallocations,
assertReallocationAction. The first two are live ordinary per-service arrays:
states pending,countered,approved,rejected,withdrawn,superseded; actions
approve,approve_and_launch,launch,not_yet,counter,accept_counter,reject,withdraw.
Do not freeze or copy the action array for validation. The maximum is50.
Function names and lengths are respectively createReallocation2,
actOnReallocation4,supersedeReallocations4,getReallocation2,listReallocations1,
assertReallocationAction1. Only create and act are async functions. The note
maximum is1000. Preserve native JSON, Map, Set, array and short-circuit behavior.

## Stored projections and common protocols

Read a proposal through Q01(ws,id), a revision through Q02(id,revision), and its
targets by parsing that row's targets_json. Read approvals through Q03(id,revision)
and construct a Map of goal_id to user_id in row order. Read all-revision goal IDs
through Q07(id), parsing each targets_json, flattening target goal_id values and
retaining first occurrence order through Set. Do not replace these protocols
with joins, memoization or row copies that change property reads.

A goal is readable by goalRow(ws,goalId), truthy row, then
canReadGoal(pp,goalObj(row)), with the final result coerced to boolean. A proposal
is visible by Q01(pp.wsId,id), then, if present, any readable goal from all its
revisions, using that row's id and ws_id. Refuse through notFound() otherwise.
Keep short circuiting: no revision query if the row is absent, and stop after the
first readable goal.

Target input validation receives pp and a raw target list. It must be a nonempty
array, else badRequest('targets must list at least one { goal_id, target_share }').
More than50 is badRequest('targets: at most 50'). For each item require a truthy
non-array object, else badRequest('each target must be { goal_id, target_share }').
Read target_share once. It must be null or a number that is an integer from0
through100 inclusive, else badRequest('target_share must be a whole percent from
0 to 100, or null'). Call visibleGoal(pp, typeof item.goal_id === 'string' ? a
fresh item.goal_id read : ''). Check duplicates through the returned goal id,
then insert a fresh read of that id into Set. A duplicate is badRequest('Each goal
can appear once'). Require status strictly active, else conflict('goal_not_active',
"A goal in this proposal is achieved or dropped, so its target can't change.").
Keep only goals whose current target_share nullishly coalesced to null differs
strictly from the proposed share. Each retained target is a fresh object in order
goal_id from a fresh goal.id read, base_version from goal.version, from_share from
a fresh goal.target_share nullishly coalesced to null, target_share from the
single input read. If no changes remain, conflict('no_change','These targets are
already set, so there is nothing to propose.'). Do not deduplicate before
validation or skip validation for a target that would be unchanged.

Fitting calls assertTargetsFit(ws,new Map(targets.map(t=>[t.goal_id,t.target_share])))
with original order and exact shares. Comparing counter targets uses a Map from
the existing revision targets to their shares, equal lengths, then every counter
target must be present with strictly equal share. Input order is immaterial;
there is no JSON-text comparison.

To approve as a user, first read approvals for id/revision, then current targets.
For each target obtain goalRow(r.ws_id,t.goal_id). Skip a missing goal, an already
approved target, or an effectiveSet(g,r.requester_id) not including user, in that
order. For each eligible goal call Q04(r.ws_id,r.id,revision,t.goal_id,user,at),
sum the exact numeric affected-row counts, and return that sum. Do not count an
ignored insert as an approval. Settling first reads approvals then targets. If
every target is approved, Q05(at,at,r.id), then
audit(r.ws_id,null,'reallocation.approved',r.id,at), return true. Otherwise return
false without either effect. Empty stored targets use ordinary every semantics.

Writing a revision calls Q06(r.ws_id,r.id,revision,JSON.stringify(targets),note,
author,at) in that order. Do not serialize early or omit null shares.

## Creation

createReallocation(pp,b) first reads pp.wsRole and refuses viewer through
forbidden('read_only','Viewers can look but not change anything.'). Next validate
b.targets, call optStr(b,'note',1000), fit pp.wsId and targets, newId('rl'), then
nowIso(). Await tx of a synchronous callback. In it, for each target compare a
fresh goalRow(pp.wsId,t.goal_id).version with t.base_version; a difference throws
conflict('stale_version','A goal changed while this was being sent. Reload the
page and propose again.'). A missing goal retains its native property error.
Then Q08(id,pp.wsId,pp.userId,at,at), revision1 with fresh {id,ws_id:pp.wsId},
validated targets/note and pp.userId, audit(pp.wsId,pp.userId,
'reallocation.requested',id,at), approve-as with fresh
{id,ws_id:pp.wsId,requester_id:pp.userId},revision1,pp.userId,at, then settle the
fresh Q01(pp.wsId,id) row. After the awaited transaction, read Q01(pp.wsId,id)
again and return its view. Do not launch or write a goal version during creation.

## Launch and state refusals

Launch permission checks every target of the current revision in order. Obtain
goalRow(r.ws_id,t.goal_id), require it exists, then
launchSet(g,r.requester_id).includes(pp.userId), then canReadGoal(pp,goalObj(g)).
Keep this service/read order and stop at the first refusal.

Writing launch targets reads the current approvals first, then targets. Pair each
target with goalRow(r.ws_id,t.goal_id), then stable-sort ascending by
(proposed share nullishly0 minus current goal target_share nullishly0).
Decreases therefore precede increases. For each pair require an existing active
goal whose version strictly equals base_version. Otherwise
conflict('stale_version',"A goal in this proposal changed, so it can't be launched.").
Call writeGoalVersion(g,{...contentOf(g),target_share:t.target_share},actor,at,
approvedBy.get(t.goal_id) ?? actor). Do not replace the goal's approver with the
launcher or omit other content fields. The proposal must already be marked
launched when this service is called, including when a version write recursively
supersedes other proposals through the supplied port.

wrong_state text by current state:

- pending: This proposal is waiting for approval.
- countered: read the current revision's author_id. If equal to the reader, use `You countered this proposal; it waits on ${nameTo(r.requester_id,reader)} to accept it.` Otherwise `This proposal was countered by ${memberName(author)}; review the counter.`
- approved: This proposal is already approved.
- rejected: if decided_by equals reader, You declined this proposal, so nothing changes. Otherwise `This proposal was declined${r.decided_by ? ' by '+memberName(r.decided_by) : ''}, so nothing changes.` Preserve the separate decided_by reads and truthiness.
- withdrawn: if requester_id equals reader, You withdrew this proposal, so nothing changes. Otherwise `This proposal was withdrawn by ${memberName(r.requester_id)}, so nothing changes.`
- superseded: This proposal was superseded: one of its goals got a newer version or was closed first, so nothing changes.

Keep the switch's native undefined result for an unrecognized stored state.

## Acting

actOnReallocation(pp,id,action,b) first checks visible(pp,id), before the viewer
refusal. Then capture pp.userId as me, nowIso() as at, revisionRead(b,true) as sent.
Await tx of a synchronous callback. Inside, reread Q01(pp.wsId,id), then
assertRevisionReached('proposal',sent,r.revision). For counter only, validate
b.targets immediately. For counter or reject only, call optStr(b,
action==='reject'?'reason':'note',1000) immediately afterwards. This validation
occurs before action state/role checks. Then read current targets, requester
equality, and whether any current target has a goalRow and
effectiveSet(g,r.requester_id).includes(me), stopping at the first eligible goal.

The following guard protocols keep their original invocation and read order:

- in-state compares the supplied allowed states with r.state; failure is conflict('wrong_state',the state refusal for me).
- expected revision: if (required OR b.revision is not undefined), and a fresh b.revision differs strictly from r.revision, refuse. Read b.revision separately for both tests. For a countered row obtain current revision author_id; otherwise author is null. Truthy author yields `${nameTo(author,me)} countered it, and it is now at revision ${r.revision}`, otherwise `it is now at revision ${r.revision}`. Throw conflict('stale_revision',`This proposal changed after you read it: ${what}. Read it again and decide again.`).
- approver-only: if no eligible goal, forbidden('not_an_approver','Only someone who can approve for one of these goals can do this.').
- requester-only: if not requester, forbidden('not_requester','Only the person who asked can do this.').
- launcher-only: if launch permission fails, forbidden('not_a_launcher','Only someone who can launch for every goal in it (an approver of each, or a workspace owner who can read them all) can launch it.').
- launchable: require approved state and launch pending or not_yet. Failure conflict('wrong_state', r.launch==='launched' ? `These targets were already launched by ${r.launch_by ? nameTo(r.launch_by,me) : 'someone'}.` : the state refusal).

Approval is approver-only, in-state pending, required expected revision, then
approve-as for me/current revision. A falsy affected count throws
conflict('already_approved','The goals you can approve for are already approved.').
Otherwise Q09(at,r.id), audit(r.ws_id,me,'reallocation.approval',r.id,at), then
return settle(r,at).

Launch is launcher-only, then fit freshly reread current targets, then
Q10(me,at,at,r.id), then write launch targets, then
audit(r.ws_id,me,'reallocation.launched',r.id,at). Keep marking before versions.

Dispatch actions in the following way, with no default refusal or fallback:

- approve: approval protocol.
- approve_and_launch: launcher-only before any approval. Approval must return true, else conflict('not_ready',"Other goals in this proposal still need an approval, so it can't launch yet; approve it instead."). Then launch. A failed combined action leaves all writes subject to tx rollback.
- launch: launchable, optional expected revision, then launch.
- not_yet: launcher-only, launchable, optional expected revision. If already not_yet, who is 'You' when launch_by equals me, otherwise memberName(launch_by) when truthy, otherwise 'Someone'; conflict('wrong_state',`${who} already decided not yet, so nothing changes: agents keep the old targets until someone launches the new ones.`). Otherwise Q11(me,at,at,r.id), audit(...,'reallocation.not_yet',...).
- counter: approver-only; requester is forbidden('not_an_approver','Withdraw and propose again to change your own proposal.'); in-state pending; optional expected revision; equal counter targets conflict('no_change',the exact captured COUNTER_SAME_AS_PROPOSAL). Fit the already validated counter targets, increment r.revision by1, write that revision with note/me/at, Q12(next,at,r.id), approve-as for me at next revision, audit(...,'reallocation.countered',...). Do not settle or launch.
- accept_counter: requester-only, in-state countered, optional expected revision. Every current target's goalRow(r.ws_id,t.goal_id)?.version must strictly equal base_version, else conflict('stale_version',"A goal in this proposal changed after the counter, so it can't go back for approval. Withdraw it and propose again."). Fit current targets; Q13(at,r.id); approve-as at current revision for me; audit(...,'reallocation.counter_accepted',...); settle a fresh {...r,state:'pending'} at at.
- reject: approver-only; requester forbidden('not_an_approver','Withdraw your own proposal instead.'); in-state pending or countered; optional expected revision; Q14(me,note,at,at,r.id), audit(...,'reallocation.rejected',...).
- withdraw: requester-only, in-state pending or countered, optional expected revision, Q15(at,at,r.id), audit(...,'reallocation.withdrawn',...).

Each abbreviated audit above has arguments r.ws_id,me,action,r.id,at. After the
awaited tx, Q01(pp.wsId,id) again and return its view. Do not reuse the pre-write
row for the result. Unknown action still performs the common reads and commits
its empty callback, then returns the fresh view, as in the original service.

## Superseding

supersedeReallocations(ws,goalId,actorId,at) calls Q16(ws,goalId). For each row in
returned order, Q17(at,at,row.id), then
audit(ws,actorId,'reallocation.superseded',a fresh row.id read,at). Q16 matches
only a proposal's current revision and pending/countered or approved-unlaunched
state; launched proposals are excluded. Q17 retains existing decided_at through
COALESCE and changes launch to superseded only when the original state was
approved. The caller owns the surrounding transaction. Return undefined.

## Read view and groups

View first reads approval Map for current id/revision, then pp.userId. Map the
current targets in order. For each target obtain goalRow(r.ws_id,t.goal_id), seen
as an existing goal and canReadGoal(pp,goalObj(g)), and effectiveSet(g,r.requester_id)
whenever a goal exists, including when unreadable. The effective set containing
me makes isApprover true, and lacking current approval also makes canApproveNow
true. The target record is fresh and ordered:

- goal: seen ? a fresh {id:g.id,title:g.title} : null.
- from_share: seen ? t.from_share : null.
- current_share: seen ? (g.target_share ?? null) : null.
- target_share: seen ? t.target_share : null.
- base_version: seen ? t.base_version : null.
- approvers: seen ? set.map(person) : fresh [].
- approved_by: seen ? person(approved.get(t.goal_id) ?? null) : null.
- approved: approved.has(t.goal_id), even when unreadable.

person(id) returns null for falsy id, otherwise fresh {id,name:memberName(id)}.
Keep independent person calls, without interning. isRequester is r.requester_id
strictly equal to me; open is pending or countered; unlaunched is approved and
launch pending or not_yet. launcher evaluates (state pending OR unlaunched) AND
launch permission. Build fresh can keys in order:
approve = pending AND canApproveNow;
approve_and_launch = pending AND canApproveNow AND launcher AND every projected
target either approved OR has an approver whose id is me;
launch = unlaunched AND launcher;
not_yet = unlaunched AND launcher AND launch is not not_yet;
counter = pending AND isApprover AND not requester;
accept_counter = countered AND requester;
reject = open AND isApprover AND not requester;
withdraw = open AND requester.
Preserve the left-to-right reads and short circuiting. If pp.wsRole is viewer,
iterate Object.keys(can) and set every action false.

Next read Q18(r.id) and map each revision to fresh ordered
{revision:x.revision,author:person(x.author_id),note:x.note,created_at:x.created_at}.
Return a fresh view in this order: id, state, revision, requester from person of a
fresh r.requester_id read, targets, note from freshly reread current revision,
history, launch, launch_decided_by from person(r.launch_by), launch_decided_at
from r.launch_at, rejected_by only for rejected state then person(r.decided_by),
rejection_reason only for rejected state then r.decision_note,
waiting_on_me = can.approve OR can.accept_counter OR (can.launch AND
r.launch==='pending'), can, created_at, updated_at, decided_at. Read matching r
fields separately in that order; hidden targets remain present without numbers
or identities. Do not convert the action expressions before their short circuits.

getReallocation(pp,id) views visible(pp,id). listReallocations(pp) first calls
Q19(pp.wsId), including its limit before filtering. Retain rows with any readable
goal from any revision. Map each retained row to its view once, then return fresh
{waiting_on_me:views.filter(v=>v.waiting_on_me),
mine:views.filter(v=>!v.waiting_on_me && v.requester.id===pp.userId),
others:views.filter(v=>!v.waiting_on_me && v.requester.id!==pp.userId)}.
Keep the exact view object references in these arrays, stable database ordering,
and fresh pp.userId reads in the filters.

assertReallocationAction(a) uses the exact live REALLOCATION_ACTIONS.includes(a).
A missing action throws notFound(); an included action returns the exact a.

All external effects pass through the declared resources. No source import,
ambient date, environment, configuration, filesystem, network, randomness,
permission substitute, hidden cache or recovery path is allowed. Preserve every
resource/property failure, including failures after a committed transaction.

## Exact SQL interfaces

### Q01 get with 2 bindings

```sql
SELECT * FROM v2_reallocations WHERE ws_id = ? AND id = ?
```

### Q02 get with 2 bindings

```sql
SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? AND revision = ?
```

### Q03 all with 2 bindings

```sql
SELECT goal_id, user_id FROM v2_reallocation_approvals WHERE reallocation_id = ? AND revision = ?
```

### Q04 run with 6 bindings

```sql
INSERT OR IGNORE INTO v2_reallocation_approvals (ws_id, reallocation_id, revision, goal_id, user_id, at) VALUES (?, ?, ?, ?, ?, ?)
```

### Q05 run with 3 bindings

```sql
UPDATE v2_reallocations SET state = 'approved', launch = 'pending', decided_at = ?, updated_at = ? WHERE id = ?
```

### Q06 run with 7 bindings

```sql
INSERT INTO v2_reallocation_revisions (ws_id, reallocation_id, revision, targets_json, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
```

### Q07 all with 1 bindings

```sql
SELECT targets_json FROM v2_reallocation_revisions WHERE reallocation_id = ?
```

### Q08 run with 5 bindings

```sql
INSERT INTO v2_reallocations (id, ws_id, requester_id, state, revision, created_at, updated_at) VALUES (?, ?, ?, 'pending', 1, ?, ?)
```

### Q09 run with 2 bindings

```sql
UPDATE v2_reallocations SET updated_at = ? WHERE id = ?
```

### Q10 run with 4 bindings

```sql
UPDATE v2_reallocations SET launch = 'launched', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?
```

### Q11 run with 4 bindings

```sql
UPDATE v2_reallocations SET launch = 'not_yet', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?
```

### Q12 run with 3 bindings

```sql
UPDATE v2_reallocations SET state = 'countered', revision = ?, updated_at = ? WHERE id = ?
```

### Q13 run with 2 bindings

```sql
UPDATE v2_reallocations SET state = 'pending', updated_at = ? WHERE id = ?
```

### Q14 run with 5 bindings

```sql
UPDATE v2_reallocations SET state = 'rejected', decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?
```

### Q15 run with 3 bindings

```sql
UPDATE v2_reallocations SET state = 'withdrawn', decided_at = ?, updated_at = ? WHERE id = ?
```

### Q16 all with 2 bindings

```sql
SELECT r.id FROM v2_reallocations r JOIN v2_reallocation_revisions v ON v.reallocation_id = r.id AND v.revision = r.revision
     WHERE r.ws_id = ? AND (r.state IN ('pending','countered') OR (r.state = 'approved' AND r.launch IN ('pending','not_yet')))
     AND EXISTS (SELECT 1 FROM json_each(v.targets_json) j WHERE json_extract(j.value, '$.goal_id') = ?)
```

### Q17 run with 3 bindings

```sql
UPDATE v2_reallocations SET launch = CASE WHEN state = 'approved' THEN 'superseded' ELSE launch END, state = 'superseded', decided_at = COALESCE(decided_at, ?), updated_at = ? WHERE id = ?
```

### Q18 all with 1 bindings

```sql
SELECT * FROM v2_reallocation_revisions WHERE reallocation_id = ? ORDER BY revision
```

### Q19 all with 1 bindings

```sql
SELECT * FROM v2_reallocations WHERE ws_id = ? ORDER BY updated_at DESC, id LIMIT 200
```



#### Scenario: Approve and launch target changes through explicit caller resources

- **WHEN** the Node reallocation target is selected
- **THEN** Capture twenty-six resources once and preserve nine runtime values, three caller types and nineteen SQL interfaces. Retain exact creation, per-goal revision approvals, counters, counter acceptance, rejection, withdrawal, not-yet, separate launch, decreases-before-increases, approver authority, superseding of current open revisions, hidden-goal projections, viewer refusals, grouping, stale revision/version checks, transaction and audit order, references, and propagated failures. The consuming service owns database, policy, clock, validation and goal version effects.
