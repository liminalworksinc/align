# Node-Server-Goal-Activity implementation Flavor

## ADDED Requirements

### Requirement: Node goal activity binding [authored:node-server-goal-activity-v2]

# Node goal activity service binding

Build dependency-free CommonJS package server_goal_activity, containing exactly
create_goal_activity.js and package.json as regular files in a regular package
directory, without symbolic links. The manifest has name server_goal_activity,
type commonjs and exports {"./create_goal_activity":"./create_goal_activity.js"}.
Export exactly synchronous create_goal_activity(resources), length 1.

Capture these 7 resource properties once in order, without enumeration: all,
get, visibleGoals, visibleGoal, activityEvidence, nowIso, readDate. Call supplied
functions with an undefined receiver. There is no ambient Date, IO, filesystem,
network, process, random, timer, Buffer or imported module dependency. readDate
returns the current Date constructor at each original lookup.

Return in order ACTIVITY_WINDOW_DAYS, seesActivityDetail, goalActivity,
goalsActivity. The first is the number 14. The three named synchronous functions
have signatures seesActivityDetail(principal,goal), goalActivity(principal,id),
goalsActivity(principal), with lengths 2, 2 and 1. Preserve GoalActivity and
GoalActivityItem as caller-owned TypeScript types. The HTTP caller adds its
window_days field; these service results do not add it.

## Supplied interfaces and private detail predicate

all(sql,...bindings) returns the supplied row array; get(sql,...bindings)
returns a supplied row or undefined. visibleGoals(principal) returns readable
goal rows. visibleGoal(principal,id) returns its readable row or throws the
supplied visibility refusal. activityEvidence({sessions,last_activity_at})
returns the evidence classification to retain unchanged. nowIso() returns the
separate live time used for file expiry. readDate() supports static now and
construction followed by toISOString. Do not cache or combine clock resources.

The principal exposes wsId, userId, wsRole and pods. The pods object's has
method keeps that object as receiver. A goal exposes ws_id, id, title, owner_id,
pod_id and status. Session lines expose session_key, user_id, harness, state,
agent_stopped, governing_goal_id and open_goal. Supplied objects and arrays can
have getters and failures at individual reads. Preserve each lookup and native
collection operation rather than caching, reordering or omitting reads.

seesActivityDetail first reads goal.owner_id then principal.userId for strict
equality. On failure, read goal.pod_id for truthiness; when truthy, read
principal.pods, its has method, and a second goal.pod_id for that method call.
Only if this branch fails, read principal.wsRole and compare it with owner.
Return this short-circuited boolean expression. It performs no visibility or
SQL call and adds no viewer restriction.

## One goal's private activity computation

goalActivity first calls visibleGoal(principal,id). Pass that returned row and
principal into the private activity computation. Its default current time is
readDate().now(), evaluated after visibility succeeds. The aggregate operation
instead supplies its already captured time to this computation.

First capture workspace from goal.ws_id. Construct the since time with a fresh
readDate constructor at currentTime minus 14*24*3600*1000 and call toISOString.
Run Q01 using that workspace, since, then two separate goal.id reads. Preserve
the exact EXISTS and open-epoch SQL, including the inclusive epoch end bound.

A private lastOf(sessionKey) helper evaluates Q02 and its optional t first,
then Q03 and optional t, reading goal.id separately at each query. It selects
the latest through a native reduce over the supplied primitive timestamps:
keep a truthy timestamp when the current maximum is falsy or timestamp is
lexically greater. Start at null. Do not parse these times, filter them through
the window, or collapse null and missing results into a different return value.

Create by_harness with claude-code then codex, both zero; active_now zero and
an empty mine array. Construct the cutoff with another fresh readDate at
currentTime minus 90*60*1000, then toISOString, even when the line array is empty.
Iterate the supplied line array natively. For each line:

1. Increment by_harness[line.harness] with ordinary ++.
2. Read session_key for lastOf and hold that result.
3. Compute onGoalNow by reading open_goal then goal.id for strict equality,
   or, if unequal, governing_goal_id then another goal.id for equality.
4. Increment active_now only when state is shared, agent_stopped is falsy,
   onGoalNow is true, last is truthy, and last >= cutoff, in that order.
5. Compare line.user_id with a fresh principal.userId. If equal, append fields
   session_key, harness, state from fresh line reads, then last_activity_at from
   the held last value, in that order. Compute mine even for count-only readers.

Then compute last_activity_at with the same latest selector over Q04 optional t,
Q05 optional t and Q06 optional t, evaluated in that order with fresh goal.id
reads. Retain these existing aggregate queries without adding date or expiry
predicates. All three queries still execute when there are no session lines.

Initialize detail to null. When seesActivityDetail succeeds, call nowIso once
and hold live. Run Q07 with workspace, fresh goal.id and live, then map its
supplied row array to fresh row.path reads. Run Q08 with workspace, fresh
goal.id, live and live. Read optional n and default only null or undefined to
zero. Store detail fields files, files_hidden, mine in order.

Finally return sessions from lines.length, active_now, by_harness,
last_activity_at, evidence_class and detail in that order. evidence_class calls
activityEvidence with a new object whose sessions reads lines.length again,
then last_activity_at uses the held value. Preserve the returned classifier
value and the existing detail and array references.

## Aggregate readable activity

goalsActivity creates a per-call team Map and its primitive-id helper. A falsy
team id returns null. For a truthy id not yet in the Map, run Q09 with fresh
principal.wsId and that id and store the whole returned {id,name} row, or null
only for a nullish result. Cache misses too. Return the held Map value.

Capture readDate().now() once before visibleGoals. Filter that supplied array
by fresh goal.status strictly equal to active. Map each surviving goal by first
building a goal field with fresh id, title and pod_id reads for the team helper,
then spreading that goal's activity computed with the held current time. Do not
capture a separate Date.now for each goal.

Sort mapped values by Number(!!right.detail)-Number(!!left.detail), then
(right.last_activity_at ?? "").localeCompare(left.last_activity_at ?? ""),
then left.goal.title.localeCompare(right.goal.title), preserving native
short-circuiting and failure behavior. After the complete sort, run Q10 with
fresh principal.wsId then principal.userId. Read optional n and default only
nullish values to zero. Return fields goals then unbound.

## Exact SQL programs

Use the following complete interface programs, including their whitespace,
port and argument evaluation order. No additional data columns are read.

Q01, bindings ws, since, g.id, g.id:

```sql
SELECT s.session_key, s.user_id, s.harness, s.state, s.agent_stopped, s.governing_goal_id,
            (SELECT o.goal_id FROM v2_epochs o WHERE o.ws_id = s.ws_id AND o.session_key = s.session_key AND o.ends_at IS NULL) AS open_goal
     FROM v2_sessions s
     WHERE s.ws_id = ? AND EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key
                                   AND (e.ends_at IS NULL OR e.ends_at >= ?) AND (e.goal_id = ? OR s.governing_goal_id = ?))
     ORDER BY s.session_key
```

Q02, bindings ws, key, g.id:

```sql
SELECT MAX(u.ts) AS t FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE u.ws_id = ? AND u.session_key = ? AND e.goal_id = ?
```

Q03, bindings ws, key, g.id:

```sql
SELECT MAX(starts_at) AS t FROM v2_epochs WHERE ws_id = ? AND session_key = ? AND goal_id = ?
```

Q04, bindings ws, g.id:

```sql
SELECT MAX(u.ts) AS t FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE u.ws_id = ? AND e.goal_id = ?
```

Q05, bindings ws, g.id:

```sql
SELECT MAX(starts_at) AS t FROM v2_epochs WHERE ws_id = ? AND goal_id = ?
```

Q06, bindings ws, g.id:

```sql
SELECT MAX(at) AS t FROM v2_activity WHERE ws_id = ? AND goal_id = ?
```

Q07, bindings ws, g.id, live:

```sql
SELECT path FROM v2_activity WHERE ws_id = ? AND goal_id = ? AND expires_at > ? AND path IS NOT NULL GROUP BY path ORDER BY COUNT(*) DESC, MAX(at) DESC, path LIMIT 4
```

Q08, bindings ws, g.id, live, live:

```sql
SELECT COUNT(DISTINCT path_hash) AS n FROM v2_activity a WHERE ws_id = ? AND goal_id = ? AND expires_at > ? AND path IS NULL AND path_hash IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM v2_activity b WHERE b.ws_id = a.ws_id AND b.goal_id = a.goal_id AND b.path_hash = a.path_hash AND b.path IS NOT NULL AND b.expires_at > ?)
```

Q09, bindings pp.wsId, id:

```sql
SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?
```

Q10, bindings pp.wsId, pp.userId:

```sql
SELECT COUNT(*) AS n FROM v2_sessions s WHERE s.ws_id = ? AND s.user_id = ? AND s.state = 'shared' AND s.governing_goal_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.ends_at IS NULL AND e.goal_id IS NOT NULL)
```


## Exact aggregate goal metadata keys

Each goalsActivity item has a goal object whose own keys in order are id, title,
team. The team property holds the cached whole Q09 {id,name} row or null.
Read the input goal.pod_id to look up that team. The output key is exactly team;
there is no output pod or pod_id field. Preserve this shape for every item,
including a missing team, owner detail and count-only readers.


#### Scenario: Preserve reported activity and private detail

- **WHEN** the Node goal activity target is selected
- **THEN** Capture7 resources once, preserve4 runtime values and2 caller types,10 exact SQL programs and4 live Date lookup sites. Preserve14-day session overlap and90-minute active cutoff, current-goal and stopped-agent guards, counts and reported evidence classification, owner/team/workspace-owner detail permission, own-session identities, top4 unexpired paths and hidden-hash suppression, per-call team cache, sort and unbound workspace/person isolation, and exact query/property/call/failure order. Supplied visibility owns readership. No extra content reads, delivery claim or ambient IO.
