# Node-Server-Goals implementation Flavor

## ADDED Requirements

### Requirement: Node goal and immutable-version binding [authored:node-server-goals-v5]

# Goals Node binding

Implement the complete supplied-service binding below. The consumer retains the ten TypeScript public types and its authenticated service resources.

Use Node24 or later on macOS and Linux. Export synchronous arity-one create_goals(resources) from server_goals/create_goals in dependency-free CommonJS package server_goals. Capture each listed service once, in order, without enumeration or construction-time effects. Call supplied functions with undefined receivers. Propagate capture, service and caller failures unchanged.

The native runtime package directory server_goals must contain exactly two regular, non-symlink files: create_goals.js and package.json. The directory itself must not be a symlink. Its manifest has name server_goals, type commonjs, and exactly the exports map {"./create_goals":"./create_goals.js"}. Do not put generated TypeScript declarations, source maps, tests or other files inside this package. The caller retains all ten original public TypeScript types. Root build and test adapters may live outside the native runtime package.

The ordered resources are: all, audit, get, run, tx, badRequest, conflict, forbidden, notFound, newId, nowIso, sha256hex, canBind, canReadGoal, goalVersionDirective, event, limitsIn, limitsOf, need, personName, expireOpenRequests, releaseHold, endAlignmentsToClosedGoal, feedAllocation, workspaceSteering, supersedeReallocations, cleanName, optStr, str, isBlankText, DEPENDS_ON_MAX.

Return exactly the following values in this order. Preserve named functions, async kinds and arities. Optional TypeScript parameters without defaults still count toward JavaScript function length.

| Value | Arity or kind |
| --- | --- |
| GOAL_LEVELS | constant |
| WIRE_VISIBILITIES | constant |
| toWireVisibility | 1 synchronous |
| GOAL_STATUSES | constant |
| goalObj | 1 synchronous |
| goalRow | 2 synchronous |
| visibleGoal | 2 synchronous |
| goalCore | 1 synchronous |
| parentIds | 2 synchronous |
| reviewParents | 4 synchronous |
| confirmParent | 3 async |
| transferGoals | 2 synchronous |
| transferFor | 3 synchronous |
| bindableFor | 2 synchronous |
| serializeGoal | 3 synchronous |
| visibleGoals | 1 synchronous |
| goalsFeed | 1 synchronous |
| unreadableGoals | 2 synchronous |
| dependencyCycle | 3 synchronous |
| goalsDependingOn | 2 synchronous |
| DEPENDENCY_CYCLE | constant |
| assertNoDependencyCycle | 3 synchronous |
| sameContent | 2 synchronous |
| contentOf | 1 synchronous |
| versionContentOf | 3 synchronous |
| nextContent | 4 synchronous |
| targetIn | 1 synchronous |
| assertTargetsFit | 2 synchronous |
| insertGoal | 3 synchronous |
| createGoal | 2 async |
| writeGoalVersion | 4 synchronous |
| newGoalVersion | 3 async |
| goalDetail | 2 synchronous |

The three public arrays are ordinary per-service live arrays: GOAL_LEVELS is company,team; WIRE_VISIBILITIES is private,team,workspace; GOAL_STATUSES is active,achieved,dropped. DEPENDENCY_CYCLE is the exact text "That would make these goals depend on each other in a loop.". Do not freeze or replace exposed array identities.

Default parameters preserve their evaluation points: bindableFor evaluates transferGoals from the principal before its body when transfers is undefined; nextContent defaults keepDepsFrom from prev.depends_on then loopOk false; targetIn defaults prev null; writeGoalVersion defaults authorId from actorId. reviewParents has an optional fourth argument without a JavaScript default. serializeGoal has an optional third argument without a JavaScript default.

Keep all ten public types at the consuming TypeScript boundary: GoalStatus, GoalLevel, WireVisibility, Measure, Anchors, GoalRow, GoalCore, ParentRef, Goal, GoalContent. Existing typed callers must compile unchanged at transfer acceptance.

SQL programs below are exact port contracts, including whitespace and parameter count. They are literal query interfaces. No private source argument expressions or function bodies are included here. Parameter meanings, conditional reads and service order are specified by the operation contracts below.

## Q01 get with 2 bindings

```sql
SELECT * FROM v2_goals WHERE ws_id = ? AND id = ?
```

## Q02 get with 1 bindings

```sql
SELECT name FROM ba_user WHERE id = ?
```

## Q03 get with 1 bindings

```sql
SELECT id, name FROM v2_pods WHERE id = ?
```

## Q04 all with 2 bindings

```sql
SELECT DISTINCT target_goal_id FROM v2_alignments WHERE ws_id = ? AND source_goal_id = ? AND state = 'approved' ORDER BY target_goal_id
```

## Q05 run with 5 bindings

```sql
INSERT INTO v2_goal_acks (ws_id, goal_id, parent_id, parent_version, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (goal_id, parent_id) DO UPDATE SET parent_version = excluded.parent_version, at = excluded.at
```

## Q06 get with 2 bindings

```sql
SELECT parent_version FROM v2_goal_acks WHERE goal_id = ? AND parent_id = ?
```

## Q07 all with 2 bindings

```sql
SELECT DISTINCT a.target_goal_id FROM v2_alignments a
       JOIN v2_alignment_revisions r ON r.alignment_id = a.id AND r.revision = a.revision
       JOIN v2_alignment_sessions s ON s.alignment_id = a.id AND s.revision = a.revision
       JOIN v2_sessions x ON x.ws_id = s.ws_id AND x.session_key = s.session_key
       WHERE a.ws_id = ? AND a.state = 'approved' AND r.choice = 'work_toward' AND x.user_id = ?
```

## Q08 get with 3 bindings

```sql
SELECT a.id FROM v2_alignments a
       JOIN v2_alignment_revisions r ON r.alignment_id = a.id AND r.revision = a.revision
       JOIN v2_alignment_sessions s ON s.alignment_id = a.id AND s.revision = a.revision
       WHERE a.ws_id = ? AND a.state = 'approved' AND r.choice = 'work_toward' AND a.target_goal_id = ? AND s.session_key = ?
       ORDER BY a.updated_at DESC LIMIT 1
```

## Q09 all with 1 bindings

```sql
SELECT * FROM v2_goals WHERE ws_id = ? ORDER BY created_at, id
```

## Q10 all with 1 bindings

```sql
SELECT id, depends_on_json FROM v2_goals WHERE ws_id = ?
```

## Q11 get with 3 bindings

```sql
SELECT title, measures_json, anchors_json, status, depends_on_json, limits_json, target_share FROM v2_goal_versions WHERE ws_id = ? AND goal_id = ? AND version = ?
```

## Q12 all with 1 bindings

```sql
SELECT id, target_share FROM v2_goals WHERE ws_id = ? AND status = 'active' AND target_share IS NOT NULL
```

## Q13 run with 14 bindings

```sql
INSERT INTO v2_goals (id, ws_id, owner_id, pod_id, visibility, level, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
```

## Q14 run with 11 bindings

```sql
INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, content_hash, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
```

## Q15 get with 2 bindings

```sql
SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?
```

## Q16 get with 1 bindings

```sql
SELECT COUNT(*) AS n FROM v2_goals WHERE ws_id = ?
```

## Q17 run with 12 bindings

```sql
UPDATE v2_goals SET version = ?, title = ?, measures_json = ?, anchors_json = ?, depends_on_json = ?, limits_json = ?, target_share = ?, status = ?, updated_at = ? WHERE ws_id = ? AND id = ? AND version = ?
```

## Q18 run with 13 bindings

```sql
INSERT INTO v2_goal_versions (ws_id, goal_id, version, title, measures_json, anchors_json, depends_on_json, limits_json, target_share, status, content_hash, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

## Q19 all with 2 bindings

```sql
SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND state IN ('pending','countered')
```

## Q20 run with 2 bindings

```sql
UPDATE v2_change_requests SET state = 'superseded', updated_at = ? WHERE id = ?
```

## Q21 all with 2 bindings

```sql
SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND state = 'approved' AND launch IN ('pending','not_yet')
```

## Q22 run with 2 bindings

```sql
UPDATE v2_change_requests SET state = 'superseded', launch = 'superseded', updated_at = ? WHERE id = ?
```

## Q23 all with 1 bindings

```sql
SELECT version, title, status, target_share, content_hash, created_at, created_by FROM v2_goal_versions WHERE goal_id = ? ORDER BY version DESC
```

## Q24 all with 2 bindings

```sql
SELECT source_goal_id, id AS alignment_id FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved'
```

## Corrected creation admission

After complete input validation, obtain at, read Q16 with the workspace id and perform the early too_many_goals refusal at count 1000 or more. Then await tx with a synchronous callback. Inside that callback, repeat Q16 and the identical refusal immediately before insertGoal. A missing count row coalesces to zero both times. A locked-count failure rolls back and performs no goal, version, audit or first_limit write. Do not move the cap into the low-level insertGoal path used by a fresh sample workspace. The fixed message is "This workspace has the maximum number of goals.". After successful commit, project the stored goal through serializeGoal.

## Ordered read and validation operations

Read and project goals:

- toWireVisibility maps the primitive value pod to team and returns every other supplied visibility unchanged. goalObj returns a fresh record with kind goal, then ownerId from owner_id, visibility and podId from pod_id, in that key/read order.
- goalRow calls Q01 with workspace id then goal id and returns its exact result. visibleGoal obtains that row using pp.wsId and the goal id; missing rows throw notFound(). Otherwise call need(pp,'goal.read',goalObj(row)) before returning the exact row. No role check is duplicated locally.
- goalCore first calls Q02 with g.owner_id. Next, only a truthy first g.pod_id read calls Q03 using a second g.pod_id read. Return keys id,version,title,measures,status,level,visibility,owner,team,anchors,depends_on,limits,target_share in that order. Parse measures_json directly; level coalesces null/undefined to team; visibility uses toWireVisibility. owner is a new id/name record: read g.owner_id for id, then read it again before owner?.name for personName. team is a new id/name record when the pod row is truthy, otherwise null. Parse anchors_json directly and depends_on_json or the literal [] when falsy. Call limitsOf with the original g. target_share coalesces null/undefined to null. Native parsing and port errors stop later fields and propagate unchanged.
- parentIds calls Q04 with workspace id and goal id, then maps target_goal_id in query order. reviewParents chooses [only] for a truthy only, otherwise calls parentIds. Per id call goalRow, skip a missing row, then call Q05 with workspace id, goal id, parent id, its current version and at. There is no extra sort or authorization call.
- Parent projection starts with a fresh output array. Iterate parentIds. Per id obtain the parent, skip a missing row or a false canReadGoal(pp,goalObj(parent)) result, then call Q06 with the child g.id and parent id. reviewed_version is ack?.parent_version coalesced to null. Append id from a fresh parent.id read, title from parent.title, version from parent.version, then reviewed_version and stale in that order. Do not substitute the relationship id variable for the parent.id read; stale is reviewed null or reviewed less than the next parent.version read. Preserve query order and all repeated parent reads.
- confirmParent gets the child with pp.wsId. Missing throws notFound. Call need(pp,'goal.edit',goalObj(child)). Require parentIds(pp.wsId,goalId).includes(parentId), otherwise notFound. Obtain at through nowIso, then await tx with a synchronous callback that calls reviewParents only for that parent, followed by audit(pp.wsId,pp.userId,'goal.parent_reviewed',goalId,at). After commit, obtain the child again and return serializeGoal.
- transferGoals calls Q07 with workspace id and user id, maps target_goal_id and returns a fresh Set preserving first query occurrence. transferFor calls Q08 with workspace id, goal id, session key, then returns its optional id coalesced to null. Do not swap the public session-key/goal-id arguments.
- bindableFor's omitted/undefined transfer argument evaluates transferGoals(pp.wsId,pp.userId) before entering the body. An inactive g.status returns false without policy or membership access. Otherwise call canBind(pp,goalObj(g),transfers.has(g.id)) and return its result.
- serializeGoal first obtains goalCore. Filter that core's dependency ids in order: query each using pp.wsId, then retain a truthy row only when canReadGoal(pp,goalObj(row)) is truthy. Return a new record spreading the core's current keys, replace depends_on with that new array, then compute bindable with the supplied optional transfer Set and contributes_to with the parent projection. Do not make an extra transfer query when a Set was supplied.
- visibleGoals calls Q09 with pp.wsId and filters rows by canReadGoal(pp,goalObj(row)), in order, without cloning retained rows. goalsFeed first obtains one transfer Set, then feedAllocation(pp), then visibleGoals. Project each visible goal with that same Set and append allocation from shares.get(g.id) coalesced to null. Obtain workspaceSteering(pp.wsId). Hash JSON.stringify of a record with goals then steering and take its first sixteen code units. Return version,goals,steering in that order.
- unreadableGoals filters the supplied ids in order. Query each in pp.wsId; retain it only when the row exists and canReadGoal(pp,goalObj(row)) is false. Preserve repeated ids and disclose none of their content.

Validate version content:

- Measures omitted as undefined return the previous array itself. Present values must be arrays of at most ten. Otherwise throw badRequest with measures must be a list or measures: at most 10. Each item must be a truthy nonarray object, otherwise each measure must be an object with text. Per item call str(body,'text',300), then optStr(body,'target',100). Keep a sent id only when the first b.id read is a string, a previous record matches it and no current output record matches it. In every previous-record comparison read that record's id followed by a fresh b.id read. In every output-record comparison read its id followed by another fresh b.id read. Return a fresh id,text,target record; keeping uses yet another b.id read, otherwise newId('m'). Retain scan order and short circuits; never cache b.id across comparisons. This matching does not compare the measure's new text.
- Anchors omitted as undefined return the previous record itself. A present value must be a truthy nonarray object, otherwise anchors must be an object. Process repos,branch_patterns,issues in that order. An omitted field returns its corresponding previous array itself. Present fields must be arrays of at most twenty, with anchors.KEY must be a list or anchors.KEY: at most 20. Every item must be a string, otherwise anchors.KEY must be a list of strings. Call cleanName, then trim the supplied result. Above 200 code units refuse anchors.KEY items are too long (max 200 characters). Only after that length check, retain nonblank text according to isBlankText and suppress an exact duplicate already in this new list. Preserve first occurrence order.
- Dependency validation omitted as undefined returns the previous array itself. Present values must be arrays, otherwise depends_on must be a list of goal ids. Above the supplied DEPENDS_ON_MAX refuse with too_many_dependencies and the exact contextual message described below. For each id, a nonstring or strict equality with the current goal id refuses depends_on must list other goals. Query the goal in pp.wsId, then require canReadGoal(pp,goalObj(row)); missing/unreadable throws notFound. Keep first occurrence of each readable sent id.
- Then obtain unreadableGoals from the supplied keep-from list and filter out ids already in the new output. Its duplicates are preserved. If new readable plus retained unreadable count exceeds DEPENDS_ON_MAX, refuse with too_many_dependencies and the contextual message using the retained count. Return a fresh array of the readable output followed by retained unreadable ids. A falsy or omitted current goal id adds no separate validation or repair.
- The dependency-bound message is A goal can depend on at most N other goals; choose fewer. For retained count one insert , and 1 goal you can't see stays on its list before the semicolon. For another positive count insert , and K goals you can't see stay on its list. N is the supplied maximum. Throw the value returned by badRequest(message,'too_many_dependencies') unchanged.
- targetIn returns prev for undefined and null for null. Otherwise require a primitive number that is an integer from zero through 100. Failure throws badRequest('target_share must be a whole percent from 0 to 100, or null'). Its omitted prev defaults to null.

Graphs and hashes:

- dependencyCycle calls Q10 with workspace id and constructs an id-to-dependency-list Map by parsing each depends_on_json or [] when falsy, in query order. Replace the current goal's entry with the supplied deps reference. Use a fresh seen Set and a stack copied from deps. Pop from the end. Strict equality with the current goal id returns true before the seen check. Skip already seen ids; otherwise mark seen and obtain that id's stored decoded dependency value. Substitute an empty list only when that Map value is null or undefined, then spread the selected value onto the stack. Preserve the native iteration failure when stored JSON decodes to a non-null number or boolean, including zero and false. These raw query strings carry no list-normalization guarantee; keep their parsing and native failures. Return false after exhaustion. No read-policy filter or sort is added.
- goalsDependingOn calls Q10 and builds a dependency-id-to-dependent-id-list Map, preserving query and each parsed dependency order. Start a stack copied from the selected goal's dependent list, or empty. Pop; skip an id already in the result or equal to the queried goal. Otherwise add it and push its dependents. Return the result Set, preserving its traversal insertion order. An indirect cycle never includes the queried goal in that result.
- assertNoDependencyCycle calls dependencyCycle and, only for true, throws conflict('cycle',DEPENDENCY_CYCLE). The public constant's exact text is in the Node binding draft.
- A content hash calls sha256hex once with JSON.stringify of title,measures,anchors,status in that order, then conditionally depends_on,limits,target_share. Include depends_on only for truthy optional length, sorting a copy; include limits only for truthy optional length without reordering; include target_share only when neither null nor undefined. Preserve these legacy omissions, input arrays and conditional second property reads. For target_share, first read and compare strictly against null. If unequal, read the property again and compare strictly against undefined. If unequal again, read it a third time as the serialized field value. Keep these two tests and their distinct reads, so getters and faults retain their original evaluation points. sameContent hashes a first, then b, and compares the returned primitive hashes strictly.
- contentOf returns title,measures,anchors,status,depends_on,limits,target_share in that order. Parse measures_json and anchors_json directly, parse depends_on_json or [] when falsy, obtain limitsOf(original row), then coalesce target_share to null. versionContentOf calls Q11 with workspace id, goal id and version, returning undefined for a falsy row or contentOf for a present one.
- nextContent defaults keepDepsFrom from prev.depends_on and loopOk false before the body. Read status from b.status coalesced to prev.status, require membership in the live GOAL_STATUSES array, otherwise status must be active, achieved or dropped. Build title,measures,anchors,status,depends_on,limits,target_share in that order: omitted title retains prev.title, otherwise str(b,'title',300); use the three validators with previous fields; pass goal id, previous dependencies and keep-from to dependency validation; call limitsIn; call targetIn with previous target. Unless loopOk is truthy, check dependency cycles before content equality. For content equality call sameContent with the newly built content as its first argument and the previous content as its second argument. The first supplied hash call therefore receives the new serialized content, followed by a second hash call for the previous content. Preserve that service order and first failure. Equal content throws conflict('no_change','Nothing changed, so no new version was saved.'). Return the new record otherwise.


## Ordered write and detail operations

Targets:

- assertTargetsFit obtains Q12 with the workspace id. In query order, test next.has(row.id). For a false result add row.target_share to others. Then iterate next.values in insertion order, summing each value coalesced to zero. Add others. Only a total greater than 100 throws conflict with code targets_over_100 and message `Targets of active goals would add up to TOTAL%; keep them at 100% or less (other goals already take OTHERS%).`. The result for success is undefined. Count every query row, without visibility checks, normalization or rounding. Do not mutate next.

Insertion:

- insertGoal first obtains newId('g'), then reads f.limits coalesced to a fresh empty array, then f.targetShare coalesced to null. For a nonnull target call assertTargetsFit with pp.wsId and a fresh one-entry Map from the created id to that target. There is no capacity count, caller transaction or first_limit event here.
- Next call Q13 with bindings in this order: created id; pp.wsId; pp.userId; f.podId; f.visibility; f.level; f.title; JSON.stringify(f.measures); JSON.stringify(f.anchors); JSON.stringify(f.dependsOn); JSON.stringify(the chosen limits); chosen target; at; at. Preserve each property read at its argument position.
- Then call Q14 with pp.wsId; created id; f.title; JSON.stringify(f.measures); JSON.stringify(f.anchors); JSON.stringify(f.dependsOn); JSON.stringify(the chosen limits); chosen target; the content hash of a fresh record whose fields are title from a new f.title read, measures from a new f.measures read, anchors from a new f.anchors read, status active, depends_on from a new f.dependsOn read, limits from the chosen array and target_share from the chosen target; pp.userId; at.
- Finally call audit(pp.wsId,pp.userId,'goal.created',created id,at) and return the id. Port, getter and serialization failures stop every later effect unchanged. Mutable caller content is read again where specified; do not precompute the second row or hash before the first write.

Creation:

- createGoal reads b.level coalesced to team and requires membership in the live GOAL_LEVELS array. Failure is badRequest('level must be company or team'). Read b.visibility coalesced to workspace and require membership in live WIRE_VISIBILITIES, otherwise badRequest('visibility must be private, team or workspace'). Convert the primitive team to pod and keep other valid values unchanged.
- Obtain podId through optStr(b,'team_id',64). For company level, a truthy podId refuses with badRequest('A company goal has no team'); then visibility other than workspace refuses with badRequest('A company goal is visible to the whole workspace'). For any truthy podId call Q15 with pp.wsId then podId, and throw notFound() on a falsy result. Pod visibility with falsy podId refuses with badRequest('A team goal needs a team').
- Call need(pp,'goal.create',{kind:'goal_draft',podId}). Company level with pp.wsRole other than owner then throws forbidden('owner_only','Only a workspace owner can create a company goal.'). Obtain title through str(b,'title',300), measures through measuresIn(b.measures coalesced to a fresh empty array), anchors through anchorsIn(b.anchors coalesced to a fresh empty object), dependencies through dependsIn(pp,b.depends_on coalesced to a fresh empty array,null), limits through limitsIn(b.limits coalesced to a fresh empty array,a separate fresh empty array), target through targetIn(b.target_share), and at through nowIso(), in that order.
- Call Q16 using pp.wsId. Coalesce its optional n to zero. At count 1000 or more throw conflict('too_many_goals','This workspace has the maximum number of goals.'). Only then call and await tx with a synchronous callback. Inside it repeat Q16 with a fresh pp.wsId read and the identical refusal. Immediately afterward call insertGoal with pp, a fresh record of the prepared title,level,podId,visibility,measures,anchors,dependsOn,limits,targetShare in that key order, and at. When limits.length is truthy call event('first_limit',{ws:pp.wsId,user:pp.userId,at}). Return the created id from the callback.
- After the transaction resolves, obtain the stored row with goalRow(pp.wsId,id), then return serializeGoal(pp,row). A failed locked count causes no insertion or later effect. Do not move capacity checking into insertGoal or weaken the consuming runtime's one-server-per-data-directory guard.

Immutable versions and terminal transitions:

- writeGoalVersion defaults authorId to actorId before the body. Copy content through ordinary object spread into a new record, then replace target_share with a new content.target_share read coalesced to null. When that copy's depends_on.length is truthy, call assertNoDependencyCycle with g.ws_id, g.id and that dependency array. Next read previous target from g.target_share coalesced to null.
- Check target sums only when the copy's status is active, its target is nonnull, and at least one of these short-circuit conditions holds: g.status is not active; previous target is null; new target exceeds previous target. In that case call assertTargetsFit(g.ws_id,new Map with g.id and the new target). Preserve those property reads and their short circuits.
- Compute the new version as g.version plus one using normal JavaScript addition. Call Q17 with: new version; copy.title; JSON.stringify(copy.measures); JSON.stringify(copy.anchors); JSON.stringify(copy.depends_on); JSON.stringify(copy.limits); copy.target_share; copy.status; at; g.ws_id; g.id; g.version. A falsy returned affected-row count throws conflict('stale_version','This goal changed while you were editing. Reload to start from its latest version.'). No immutable version, audit, directive or supersession follows that refusal.
- Then call Q18 with g.ws_id; g.id; new version; copy.title; JSON.stringify(copy.measures); JSON.stringify(copy.anchors); JSON.stringify(copy.depends_on); JSON.stringify(copy.limits); copy.target_share; copy.status; contentHash(copy); authorId; at. After that call audit(g.ws_id,actorId,'goal.versioned',g.id,at).
- If copy.limits.length is truthy call event('first_limit',{ws:g.ws_id,user:authorId,at}). Next call reviewParents(g.ws_id,g.id,at), obtain next through goalRow(g.ws_id,g.id), call goalVersionDirective(g.ws_id,next), supersede the unlaunched requests for g.ws_id,g.id,actorId,at, and call supersedeReallocations with fresh reads of those same goal fields and the same actor/time. Preserve the row reference returned by goalRow.
- Only for copy.status achieved or, after the first comparison is false, a second copy.status read equal to dropped, supersede open requests, then call expireOpenRequests, releaseHold and endAlignmentsToClosedGoal, each with g.ws_id,g.id,actorId,at in that order and fresh field reads per call. Return the exact next row. The function itself supplies no transaction.
- Superseding open requests calls Q19 with workspace id then goal id. For each returned row in query order, call Q20 with at then row.id, then audit(workspace id,actorId,'change_request.superseded',a fresh row.id read,at). Superseding unlaunched requests uses Q21 and Q22 with the same per-row call and audit ordering. Do not batch, pre-read ids or filter either query again.
- newGoalVersion first calls goalRow(pp.wsId,goalId), throws notFound() if falsy, then calls need(pp,'goal.edit',goalObj(row)). If b.version is not undefined and a fresh b.version read differs strictly from row.version, throw conflict('stale_version',`This goal changed while you were editing. Reload to start from version VERSION.`), with another row.version read for the message. Obtain next through nextContent(pp,row.id,contentOf(row),b). Await tx with a synchronous callback that calls writeGoalVersion(row,next,pp.userId,nowIso()) and returns its exact result. The time service is called inside the callback after pp.userId is read. After commit read goalRow(pp.wsId,goalId) again and return serializeGoal(pp,that row).

Goal detail:

- goalDetail first obtains visibleGoal(pp,goalId). Next call Q23 with row.id. Next call Q24 with pp.wsId then a fresh row.id read. Map contributions in query order: read contribution.source_goal_id for truthiness; only for truthy read it again as the second argument to goalRow(pp.wsId,id). When the source row is truthy and canReadGoal(pp,goalObj(source)) is truthy, return a fresh record with goal containing id then title from that source. Otherwise return a fresh record with goal null. Filter using each mapped record's goal truthiness. No alignment identifier is exposed.
- Return a fresh record with keys in this order: goal from serializeGoal(pp,row); hidden_depends_on from the length of unreadableGoals(pp,JSON.parse(row.depends_on_json or the literal [] when falsy)); versions from mapping the original Q23 rows to ordinary spread copies with created_by replaced by undefined; contributions from the filtered array; can_edit from row.owner_id strictly equal to pp.userId and then pp.wsRole not viewer; can_propose from a fresh row.owner_id read not equal to a fresh pp.userId read, then a fresh pp.wsRole read not viewer, then row.status active. Preserve all short circuits. Unknown enumerable version fields survive the spread, and the created_by property remains present with undefined rather than being deleted.


## Runtime boundary

The runtime export contains only the factory and its private helpers. No ambient IO, network, environment, clock, randomness, original source import, hidden result cache, internal transaction implementation, retry or recovery is allowed. All effects pass through the declared caller resources. Keep ordinary stable standard intrinsics, query rows and caller records observable as specified.


#### Scenario: Exact goal projection, validation and transactional version effects

- **WHEN** the Node goal target is selected
- **THEN** Capture thirty-one services and constants once. Preserve thirty-three public values and their synchronous or asynchronous kinds, exact read projections and SQL interfaces, repeated field reads, dependency and target constraints, both capacity checks, immutable versions, actor and author identities, ordered directives and supersession, rollback and failure identity.
