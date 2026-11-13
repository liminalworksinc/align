# Node-Server-Requests implementation Flavor

## ADDED Requirements

### Requirement: Node request and hold binding [authored:node-server-requests-v3]

# Requests and holds Node binding

Use Node24 or later on macOS and Linux. Export synchronous arity-one
create_requests(resources) at server_requests/create_requests in a dependency-free
CommonJS package server_requests. Its regular, non-symlink package directory
contains exactly two regular, non-symlink files, create_requests.js and
package.json. The manifest has name server_requests, type commonjs and exactly
{"./create_requests":"./create_requests.js"} as its export map. No declaration,
map, test or other file belongs inside it. Root build/test adapters may be outside.
The caller retains seven public types: RequestType,SenderRole,CancelReason,
RequestJson,HoldJson,RequestView,HoldWire, with their existing structural types.

Capture these29 resources once in order, without enumeration or service calls:
approvalSet,all,audit,get,run,tx,goalTargets,writeDirective,V2Error,badRequest,
conflict,forbidden,notFound,event,newId,nowIso,goalObj,goalRow,transferFor,
visibleGoal,authorize,canReadGoal,optStr,oneOf,SESSION_KEY_RE,str,memberName,
memberPrincipal,readDate. All supplied service calls have undefined receivers.
V2Error is the exact supplied class, constructed with new. SESSION_KEY_RE is the
exact supplied object, whose live test method is called with that object as its
receiver. Preserve supplied thrown/rejected values. Transactions belong to tx;
pass it synchronous callbacks and await only in the original async operations.
No service is called during construction.

Return exactly these20 values in order: REQUEST_TYPES,REQUESTS_PER_HOUR,
SWITCH_SESSIONS_MAX,NOTE_MAX,holdRow,sendRequest,cancelRequest,expireOpenRequests,
listRequests,requestWire,expireStoppedSessionTargets,requestReceipt,
requireHolder,getHold,holdGoal,releaseHold,releaseGoal,holdNewlyBound,holdWire,
listHolds. REQUEST_TYPES is a live per-service ordinary array containing replan,
checkpoint,switch_goal in that order. The other constants are20,20,280.
Names and lengths for functions are holdRow2,sendRequest3,cancelRequest3,
expireOpenRequests4,listRequests2,requestWire2,expireStoppedSessionTargets3,
requestReceipt6,requireHolder2,getHold2,holdGoal3,releaseHold4,releaseGoal2,
holdNewlyBound3,holdWire4,listHolds1. Only sendRequest,cancelRequest,holdGoal and
releaseGoal are async functions. Preserve ordinary JSON, Set, array, optional
access, nullish and short-circuit behavior and exact object key/read order.

## Principal and projection evaluation identities

The principal is the original PolicyPrincipal record. Its role field is exactly
pp.wsRole, its workspace identifier is pp.wsId, and its person identifier is
pp.userId. Every mention of role, viewer, member or owner below reads pp.wsRole.
There is no pp.role field or replacement principal schema. Preserve each stated
fresh read and short circuit, including in can-send, require-sender, cancellation,
request-view, can_cancel and hold-view.

The request-view count helper accepts a rest array of selected states and returns
rows.filter(t => selectedStates.includes(t.state)).length. It reads each row's
state once per filtering pass. Keep filter and includes; do not replace them with
a sent-or-received predicate that reads state twice, reduce, some, every or an
eager aggregate. Before the view return, compute only pending through
count('sent','received') and then the overall state. The expired-state test is
rows.length && count('expired') === rows.length, evaluated only after a falsy
cancelled_at and a zero pending count. Do not precompute accepted, declined,
expired or not_declined statistics here.

Evaluate the return fields in their stated order. Only after id, type, goal,
target_goal, note, sender, created_at, cancelled_at, cancelled_by, state and
expired_reason have been evaluated, build counts. Its fields evaluate in order:
pending from the captured value; accepted through
rows.filter(t => t.state === 'accepted' && !t.auto_accepted).length;
declined through count('declined'); expired through count('expired');
not_declined through rows.filter(t => t.state === 'accepted' && t.auto_accepted).length.
Then evaluate sessions and can_cancel. Retain full scans, repeated property
reads and failure positions. These evaluation identities belong to the original
service even when a preceding projection field or later getter throws.

## Error-factory and release-iteration protocols

badRequest, conflict, forbidden and notFound are error factories that return the
error value. At every refusal site described below, call the indicated factory
and throw its exact returned value. A bare call that ignores the result does not
refuse anything. Preserve the original throw even if the returned value is not
an Error object. If the factory itself throws, propagate that failure unchanged.
V2Error is a separate class used with throw new V2Error at the hourly limit.

Release target construction uses the original spread-iteration protocol. First
obtain Q19(ws,goalId,heldAt).map(r=>r.session_key) as held. Build a fresh array by
spreading held, then call goalTargets(ws,goalId) and spread that exact returned
iterable into the same fresh array. Construct Set from this array, spread the
Set into another fresh array, then call its ordinary sort(). Preserve iteration,
length/getter reads and supplied failures. Do not replace the resource's spread
iteration with concat, indexed copying or array concatenation helpers.

## Common protocols

Read a request using Q01(ws,id). holdRow(ws,goalId) returns the exact Q02(ws,goalId)
row or undefined. person(id) is a fresh {id,name:memberName(id)}. sender(r) spreads
person(r.sender_id), then reads r.sender_role as role.

can-send(pp,g) returns true immediately for owner. Otherwise return role strictly
member AND approvalSet(g).includes(pp.userId), with fresh role and user reads.
require-sender(pp,g,what) first refuses viewer via
forbidden('read_only','Viewers can look but not change anything.'). Then if
can-send is false, forbidden('not_approver',`Only someone who can approve for this
goal, or a workspace owner, can ${what}.`). Do not read the approval set on the
owner path.

goal-ref(pp,ws,goalId) obtains goalRow(ws,goalId). Missing or unreadable through
canReadGoal(pp,goalObj(g)) yields fresh {id:null,title:null,version:null,private:true}.
Otherwise fresh {id:g.id,title:g.title,version:g.version}. Do not read hidden
identity/title/version on the hidden path of this web projection.

Selected session keys: read b.session_keys once. Undefined or null returns null.
A non-array throws badRequest('session_keys must be a list'). Raw length must be
from1 through20, else badRequest('session_keys: 1 to 20'), before deduplication.
Each value must be a string and pass the live SESSION_KEY_RE.test(value), else
badRequest('session_keys must be session keys'). Retain first occurrences only,
using the growing output array's includes and push. Do not sort or replace regex
semantics, receiver or failure identity.

Bindable-for-session(ws,key,target) first requires target.status active. Then
Q03(ws,key) must exist. Call memberPrincipal(ws,s.user_id), then authorize(owner,
'goal.bind',{kind:'bind',goal:goalObj(target),hasTransfer:!!transferFor(ws,key,
a fresh target.id read)}), and return the exact returned ok field. Preserve the
goal object evaluation before transfer lookup, and short circuit absent sessions.

## Sending

sendRequest(pp,goalId,b): visibleGoal(pp,goalId), require-sender with
'send a request to its agents', oneOf(b,'type',the exact live REQUEST_TYPES),
optStr(b,'note',280), selected keys. For switch_goal require non-null selected
keys, else badRequest('session_keys is required for switch_goal'). Then
str(b,'target_goal_id',64); equal to a fresh g.id read is
badRequest('target_goal_id must be another goal'); then visibleGoal(pp,tid).
For any other type, independently read b.target_goal_id for undefined and null
checks, refusing a supplied non-null value through
badRequest('target_goal_id goes only with switch_goal').

Capture nowIso() as at. Await tx callback, whose result is the new request ID.
Inside, obtain fresh goalRow(pp.wsId,g.id) as live. Non-active status throws
conflict('wrong_state','This goal is achieved or dropped, so it takes no requests.').
Obtain goalTargets(pp.wsId,g.id). If keys exist, every selected key must be in
that exact returned array, else badRequest('session_keys must be sessions on this
goal'). Use keys nullishly coalesced to that on-goal array, retaining its reference.
No targets throws conflict('no_sessions','No shared session is working on this
goal, so there is nobody to ask.'). If a target goal exists and any target session
is not bindable-for-session, conflict('not_bindable',"That goal can't be taken up
by every chosen session: it is not active, or a session's owner can't bind it.").

Q04(pp.wsId,g.id,type) detects another non-cancelled request of this type with a
sent/received target. A truthy row throws conflict('already_open','A request of
this type is still waiting for an answer on this goal; cancel it first.'). Next
Q05(pp.userId,one-hour-cutoff), read its optional n nullishly coalesced to0.
For the cutoff, evaluate one readDate() constructor before its argument, obtain a
second constructor through readDate(), call that second constructor's now method
with itself as receiver, subtract3600000, construct the first with new, then call
its toISOString with the created object as receiver. Preserve both live reads,
native failures and exact order. Count every workspace and cancellation state,
and the query's strictly-later-than comparison. A count at least20 throws
new V2Error(429,'rate_limited','Too many requests sent in the last hour, try again later').

Next newId('rq'). Sender role is approvalSet(live).includes(pp.userId) ? approver :
owner, with a new approval lookup even for owners. Then
writeDirective(pp.wsId,'request',targets,null,null,
{goalId:g.id,request:{request_id:rid,cancelled:false}}) as dir. Q06 has arguments
rid,pp.wsId,g.id,type,target?.id ?? null,live.version,note,pp.userId,role,dir,at.
For each target in order, Q07(pp.wsId,rid,key,at). Then
audit(pp.wsId,pp.userId,'request.sent',rid,at), then
event('first_request',{ws:pp.wsId,user:pp.userId,props:{type},at}), return rid.
After awaiting tx, return fresh {request:request-view(pp,g,Q01(pp.wsId,id))}.
Do not move a binding or substitute the goal's newer version after sending.

## Cancellation and expiry

cancelRequest(pp,goalId,id): visibleGoal first, then viewer refusal with the same
read_only words. Q01(pp.wsId,id) must exist and its goal_id must equal a fresh
g.id, else notFound(). If sender_id differs from pp.userId and role is not owner,
forbidden('not_sender','Only the person who sent this request, or a workspace
owner, can cancel it.'). Capture nowIso() and await tx. Reread Q01(pp.wsId,id).
If its cancelled_at is truthy, return from the callback without other effects.
Otherwise Q08(id).map(t=>t.session_key) as open; writeDirective(pp.wsId,'request',
open,null,null,{goalId:g.id,request:{request_id:id,cancelled:true,reason:'withdrawn'}}),
Q09(at,id), Q10(at,pp.userId,id), audit(pp.wsId,pp.userId,'request.cancelled',id,at).
After tx return fresh {request:request-view(pp,g,Q01(pp.wsId,id))}. Preserve the
fresh post-write query even for an already cancelled request.

expireOpenRequests(ws,goalId,actorId,at), in the caller's transaction, first
Q11(ws,goalId,goalId), ordered by creation then ID. This includes requests on the
goal and switch requests toward it, only non-cancelled requests with pending
targets. For each row Q08(r.id).map(t=>t.session_key), then writeDirective(ws,
'request',keys,null,null,{goalId:r.goal_id,request:{request_id:r.id,cancelled:true,
reason:'goal_closed'}}), Q09(at,a fresh r.id read),
audit(ws,actorId,'request.expired',a fresh r.id read,at). Do not set cancelled_at,
change answered targets or add an internal transaction. Return undefined.

expireStoppedSessionTargets(ws,sessionKey,at) returns the exact numeric affected
count from Q15(at,ws,sessionKey), updating only sent/received targets. It does not
change ended_reason or create audit/directive/clock effects. The caller owns tx.

## Request projections

request-view(pp,g,r,approvers=approvalSet(g)) first Q12(r.id) to join targets and
sessions ordered by session_key. everyone is r.sender_id===pp.userId OR role
owner OR approvers.includes(a fresh pp.userId). Count states by filtering the
exact rows. pending counts sent/received. Overall state is cancelled when
r.cancelled_at truthy, otherwise open when pending truthy, otherwise expired when
rows.length truthy and every row expired, otherwise answered. No target rows
means answered. Return a fresh object in this order:

- id:r.id; type:r.type; goal:{id:g.id,title:g.title,version:r.goal_version}.
- target_goal: truthy r.target_goal_id ? goal-ref(pp,r.ws_id,a fresh r.target_goal_id read) : null.
- note:r.note; sender:sender(r); created_at:r.created_at; cancelled_at:r.cancelled_at; cancelled_by: truthy r.cancelled_by ? person(a fresh r.cancelled_by read) : null.
- state; expired_reason:null unless expired, then sessions_ended if every row has a truthy ended_reason OR session_state strictly stopped, otherwise goal_closed.
- counts in order pending, accepted from state accepted AND falsy auto_accepted, declined, expired, not_declined from state accepted AND truthy auto_accepted. Never count an agent's automatic accept as the developer's accept.
- sessions: filter rows to everyone OR t.user_id===pp.userId, then fresh records ordered session_key, owner:person(t.user_id), mine from a fresh user comparison, repo_alias,harness,title only for that session's owner using a fresh user comparison, started_at,state,ended_reason only when state expired otherwise null,auto_accepted as !!t.auto_accepted,updated_at. Keep the original row/property order and hide another person's title even from workspace owners.
- can_cancel: !r.cancelled_at AND pending>0 AND role not viewer AND (sender_id===pp.userId OR role owner), with its short circuits and fresh reads.

listRequests(pp,goalId) first visibleGoal, then approvalSet(g), then
Q13(pp.wsId,g.id) including its limit50 before projection, then can-send(pp,g).
For a sender, map goalTargets(pp.wsId,g.id) in order to Q14(pp.wsId,key), require
the returned row by native access, compute mine from s.user_id===pp.userId, then
fresh {session_key:key,owner:person(s.user_id),mine,repo_alias:s.repo_alias,
harness:s.harness,title:mine?s.title:null,started_at:s.started_at}. A non-sender's
sessions is null. Return fresh {requests:rows.map(r=>request-view(pp,g,r,approvers)),
can_send:sender AND g.status==='active',sessions,hold:hold-view(pp,g)} in that
order. Reuse the captured approval array for request views, without re-reading it.

requestWire(pp,j) reads Q01(pp.wsId,j.request_id), returning null immediately
when absent. A title lookup obtains goalRow(r.ws_id,id), then if existing and
canReadGoal(pp,goalObj(g)), fresh {title:g.title,version:g.version}; otherwise
fresh {title:null,version:g?.version ?? null}. The device wire retains a hidden
goal's version. First compute target via truthy r.target_goal_id and a fresh ID
read. Return fresh ordered {id:r.id,type:r.type,cancelled:j.cancelled,
cancel_reason: a fresh j.cancelled read ? (j.reason ?? 'withdrawn') : null,
goal:{id:r.goal_id,title:title(a fresh r.goal_id read).title,version:r.goal_version},
target_goal: a fresh r.target_goal_id truthiness read ?
{id:a fresh r.target_goal_id read,title:target.title,version:target.version}:null,
sender:sender(r),note:r.note,created_at:r.created_at}. Keep repeated reads and
nullish fallback, including an empty string reason. Do not replace stored version.

## Request receipts

requestReceipt(ws,requestId,sessionKey,state,auto,actor) calls Q01(ws,requestId),
then Q16(requestId,sessionKey), even when the first row is missing. If either row
is absent, return null. If auto is truthy and r.type is switch_goal, throw
badRequest('A switch_goal request takes effect only when the developer accepts it')
before any target-state check. Route-level receipt validation remains separate.
Read pending as t.state sent OR a fresh t.state read received. Initialize next
from a fresh t.state read, flag from t.auto_accepted. Apply only the first matching
transition in order:

1. state received and target sent: next received, retain flag.
2. state accepted and pending: next accepted, flag auto?1:0.
3. state accepted and target accepted and !auto: flag0.
4. state declined and (pending OR target accepted AND t.auto_accepted): next declined, flag0.

If next differs from a fresh t.state read OR flag differs from a fresh
t.auto_accepted read, nowIso(), Q17(next,flag,at,requestId,sessionKey). When next
accepted, audit(ws,actor,flag?'request.not_declined':'request.accepted',requestId,at).
When next declined, audit(ws,actor,'request.declined',requestId,at). No audit for
received. No changes means no clock, write or audit. Return next. Do not add a
cancelled_at check beyond the existing target-state machine or change other
receipt states. The enclosing receipt path owns transaction and session checks.

## Holds and releases

hold-view(pp,g) reads holdRow(g.ws_id,g.id). Return fresh {held:h?
{held_by:person(h.held_by),reason:h.reason,held_at:h.held_at}:null,
can_hold:role not viewer AND can-send(pp,g)} in that order.
requireHolder(pp,goalId) calls require-sender(pp,visibleGoal(pp,goalId),
'hold or release its agents'), returning undefined. It owns no recent-sign-in
check. getHold(pp,goalId) returns hold-view(pp,visibleGoal(pp,goalId)).

holdGoal(pp,goalId,b): visibleGoal first, require-sender with 'hold its agents',
optStr(b,'reason',280), nowIso(). Await tx callback. If holdRow(pp.wsId,g.id)
exists, return false before active-goal check. Otherwise fresh
goalRow(pp.wsId,g.id).status must be active, else the same wrong_state refusal as
sending. writeDirective(pp.wsId,'hold',goalTargets(pp.wsId,g.id),null,null,
{goalId:g.id,hold:{by:pp.userId,reason,at}}) as dir. Then Q18(pp.wsId,g.id,
pp.userId,reason,at,dir), audit(pp.wsId,pp.userId,'goal.held',g.id,at),
event('first_hold',{ws:pp.wsId,user:pp.userId,at}), return true. Empty current
targets may produce a null directive, but the hold row and audit still exist.
After tx return fresh {status:created?201:200,body:getHold(pp,goalId)}. Retain the
later visibility/read effects even on a repeated hold.

Release targets: Q19(ws,goalId,heldAt).map(r=>r.session_key), then
goalTargets(ws,goalId), concatenate formerly reached before current, deduplicate
through Set and sort lexically. The exact current hold's at field selects its
deliveries, including holds written for later-bound sessions. Do not use only
sessions currently on the goal, or delivery history of a different hold.

releaseHold(ws,goalId,actorId,at): holdRow(ws,goalId), false immediately when
absent. Otherwise writeDirective(ws,'release',release-targets(ws,goalId,h.held_at),
null,null,{goalId,hold:{by:actorId,at}}), Q20(ws,goalId),
audit(ws,actorId,'goal.released',goalId,at), return true. Do not include the old
reason in the release. The caller owns the surrounding transaction.

releaseGoal(pp,goalId): visibleGoal, require-sender with 'release its agents',
await tx(()=>releaseHold(pp.wsId,g.id,pp.userId,nowIso())). The clock belongs
inside the callback and still runs for an absent hold. Then return getHold(pp,
goalId). There is no new active-goal guard during release.

holdNewlyBound(ws,goalId,sessionKey): holdRow(ws,goalId); absent returns undefined.
Then Q21(ws,goalId,h.held_at,sessionKey). If no reached row, writeDirective(ws,
'hold',[sessionKey],null,null,{goalId,hold:{by:h.held_by,reason:h.reason,
at:h.held_at}}). Existing delivery causes no directive. No transaction, clock,
audit or goal-policy lookup is added. Return undefined.

holdWire(pp,kind,goalId,j) obtains goalRow(pp.wsId,goalId), then a fresh
{id:goalId,title:existing g AND canReadGoal(pp,goalObj(g)) ? g.title : null}.
For kind strictly release return fresh {goal,released_by:person(j.by),at:j.at};
otherwise fresh {goal,held_by:person(j.by),reason:j.reason ?? null,at:j.at}.
Keep title hiding, receiver/read order and the distinct release shape.

listHolds(pp): Q22(pp.wsId), map each h to {h,g:goalRow(pp.wsId,h.goal_id)}, filter
existing g AND canReadGoal(pp,goalObj(g)), then map in original order to fresh
{goal:{id:g.id,title:g.title},held_by:person(h.held_by),reason:h.reason,
held_at:h.held_at}. Complete the first mapping for all rows before filtering.

All external effects use the declared resources. No implementation import,
ambient clock, configuration, environment, filesystem, network, randomness,
permission substitute, hidden cache or recovery is allowed. Keep native failures,
exact SQL and parameters, supplied class/regex identity, references, post-commit
read failures, and the stated order of every effect and property read.

## Exact SQL interfaces

### Q01 get with 2 bindings

```sql
SELECT * FROM v2_requests WHERE ws_id = ? AND id = ?
```

### Q02 get with 2 bindings

```sql
SELECT * FROM v2_goal_holds WHERE ws_id = ? AND goal_id = ?
```

### Q03 get with 2 bindings

```sql
SELECT user_id FROM v2_sessions WHERE ws_id = ? AND session_key = ?
```

### Q04 get with 3 bindings

```sql
SELECT 1 AS x FROM v2_requests r WHERE r.ws_id = ? AND r.goal_id = ? AND r.type = ? AND r.cancelled_at IS NULL
       AND EXISTS (SELECT 1 FROM v2_request_targets t WHERE t.request_id = r.id AND t.state IN ('sent','received'))
```

### Q05 get with 2 bindings

```sql
SELECT COUNT(*) AS n FROM v2_requests WHERE sender_id = ? AND created_at > ?
```

### Q06 run with 11 bindings

```sql
INSERT INTO v2_requests (id, ws_id, goal_id, type, target_goal_id, goal_version, note, sender_id, sender_role, directive_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

### Q07 run with 4 bindings

```sql
INSERT INTO v2_request_targets (ws_id, request_id, session_key, state, updated_at) VALUES (?, ?, ?, 'sent', ?)
```

### Q08 all with 1 bindings

```sql
SELECT t.session_key FROM v2_request_targets t WHERE t.request_id = ? AND t.state IN ('sent','received')
```

### Q09 run with 2 bindings

```sql
UPDATE v2_request_targets SET state = 'expired', updated_at = ? WHERE request_id = ? AND state IN ('sent','received')
```

### Q10 run with 3 bindings

```sql
UPDATE v2_requests SET cancelled_at = ?, cancelled_by = ? WHERE id = ?
```

### Q11 all with 3 bindings

```sql
SELECT r.id, r.goal_id FROM v2_requests r WHERE r.ws_id = ? AND (r.goal_id = ? OR r.target_goal_id = ?) AND r.cancelled_at IS NULL
     AND EXISTS (SELECT 1 FROM v2_request_targets t WHERE t.request_id = r.id AND t.state IN ('sent','received')) ORDER BY r.created_at, r.id
```

### Q12 all with 1 bindings

```sql
SELECT t.session_key, t.state, t.ended_reason, s.state AS session_state, t.auto_accepted, t.updated_at, s.user_id, s.repo_alias, s.harness, s.title, s.started_at
     FROM v2_request_targets t JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE t.request_id = ? ORDER BY t.session_key
```

### Q13 all with 2 bindings

```sql
SELECT * FROM v2_requests WHERE ws_id = ? AND goal_id = ? ORDER BY created_at DESC, id LIMIT 50
```

### Q14 get with 2 bindings

```sql
SELECT user_id, repo_alias, harness, title, started_at FROM v2_sessions WHERE ws_id = ? AND session_key = ?
```

### Q15 run with 3 bindings

```sql
UPDATE v2_request_targets SET state = 'expired', updated_at = ? WHERE ws_id = ? AND session_key = ? AND state IN ('sent','received')
```

### Q16 get with 2 bindings

```sql
SELECT state, auto_accepted FROM v2_request_targets WHERE request_id = ? AND session_key = ?
```

### Q17 run with 5 bindings

```sql
UPDATE v2_request_targets SET state = ?, auto_accepted = ?, updated_at = ? WHERE request_id = ? AND session_key = ?
```

### Q18 run with 6 bindings

```sql
INSERT INTO v2_goal_holds (ws_id, goal_id, held_by, reason, held_at, directive_id) VALUES (?, ?, ?, ?, ?, ?)
```

### Q19 all with 3 bindings

```sql
SELECT DISTINCT t.session_key FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id
  WHERE d.ws_id = ? AND d.goal_id = ? AND d.kind = 'hold' AND json_extract(d.hold_json, '$.at') = ?
```

### Q20 run with 2 bindings

```sql
DELETE FROM v2_goal_holds WHERE ws_id = ? AND goal_id = ?
```

### Q21 get with 4 bindings

```sql
SELECT 1 AS x FROM (SELECT DISTINCT t.session_key FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id
  WHERE d.ws_id = ? AND d.goal_id = ? AND d.kind = 'hold' AND json_extract(d.hold_json, '$.at') = ?) WHERE session_key = ?
```

### Q22 all with 1 bindings

```sql
SELECT * FROM v2_goal_holds WHERE ws_id = ? ORDER BY held_at
```



#### Scenario: Send typed requests, record session answers and maintain goal holds through explicit caller resources

- **WHEN** the Node request/hold target is selected
- **THEN** Capture twenty-nine resources once and preserve twenty runtime values, seven caller types and twenty-two exact SQL interfaces. Retain sender authorization, live request types, key deduplication and selection bounds, per-person hourly limits and both live Date lookups, directive/request/target/audit/event transaction order, sender-role capture, cancellation and goal-closure expiry, precise receipt transitions and agent-versus-developer acceptance, web and device privacy, holds for newly-bound sessions, release to previously-held and current sessions, native failures and exact method/read/effect ordering. Preserve supplied V2Error class and SESSION_KEY_RE receiver identity. Route-owned receipt and recent-sign-in validation remain separate.
