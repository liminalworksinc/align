# Node-Server-Spend implementation Flavor

## ADDED Requirements

### Requirement: Node spending binding [authored:node-server-spend-v4]

# Node spending service binding

Build a dependency-free CommonJS package server_spend. Its package directory
contains exactly create_spend.js and package.json, all regular and without
symbolic links. The manifest has name server_spend, type commonjs and exports
{"./create_spend":"./create_spend.js"}. Export exactly the synchronous named
function create_spend(resources), length 1.

Capture exactly once, in order, resource properties all, badRequest, goalObj,
canReadGoal, need. Do not enumerate the resource object. Invoke each captured
function with an undefined receiver. There is no ambient Date, filesystem,
network, process, console, random, timer, Buffer or module dependency.

Return spend(principal,by,from,to), then goalSpend(workspace,goalId,from,to).
Both are synchronous named functions of length 4. Preserve caller types
SpendBy = "goal" | "team" | "session", and Sums with all nine numeric fields
plus by_basis containing a separate nine-field object for each billing basis.
This library does not perform the HTTP route's by=pod normalization.

The ordered numeric fields are requests, input, output, cache_read,
cache_write_5m, cache_write_1h, cache_write_unsplit, est_list_usd_micros,
unpriced_requests. Ordered bases are api_usd, subscription_included,
workspace_credits, estimated_list_usd, unknown. A new sums object has zero for
every number, then a by_basis object in that order. Each basis has independent
zeros. Adding an aggregate first reads basis for includes, then reads it again
when recognized; otherwise use unknown. For every numeric key, first add the
aggregate's field to the top-level sum, then read/add it again into that basis.
Use ordinary JavaScript += without coercion, fallback or null normalization.

## Supplied interfaces

all(sql,...bindings) returns the supplied row array. badRequest(message)
returns the exact value to throw, including falsy values; preserve a thrown
factory failure too. goalObj(row) converts the supplied goal row.
canReadGoal(principal,convertedGoal) returns visibility. need(principal,action)
enforces permission and may throw. The principal exposes wsId and userId.
Supplied rows, arrays and principals can have getters, unknown fields and
failures at individual reads. Preserve native collection operations and exact
lookup sites instead of adding, caching or rearranging reads.

## spend protocol

Call need(principal,"spend.read") first. Then evaluate from && to && from >= to
and, when true, throw badRequest("from must be before to"). Do not replace the
truthy guard with null checks or parse dates in this function.

Run Q01 with fresh principal.wsId, from, from, to, to. Next run Q02 with a new
principal.wsId read and the same four bounds. Map every rollup row by spreading
all own enumerable fields and appending rolled:true. Then run Q03 with fresh
principal.wsId and build a Map of goal.id to the same row. Run Q04 similarly,
mapping pod.id to pod.name, a string value read at this point. Run Q05 with fresh principal.wsId
then principal.userId, mapping session.session_key to the same session row.
Keep these five reads even if prior query results are empty.

Build independent total and unallocated sums and an insertion-ordered bucket
Map. A bucket is created once, preserving its first label, kind and extra
fields, with a new sums object. Iterate a native spread of raw rows followed
by rolled rows. Add each row to total first. If row.goal_id is falsy, add it to
unallocated and continue without visibility or session lookup. Otherwise read
row.goal_id again for the goal Map, then compute visibility as goal truthiness
and canReadGoal(principal,goalObj(goal)), even for session grouping.

For by strictly equal to session, check row.rolled first. A rolled row goes to
key/kind rolled_up, label "Older sessions (rolled up)", then continues.
Otherwise compare row.session_owner to a fresh principal.userId and, if equal,
look up sessions using a fresh row.session_key. With an own session, use key
"session:" plus a fresh row.session_key, kind session, label session.title or
session.repo_alias or `${session.harness} session`, and extra session_key from
another row.session_key read. Otherwise use key/kind others and label
"Other people's sessions". Continue after either branch.

For other groupings, an invisible or missing goal goes to key/kind private,
label "Private goals". With visible goals and by strictly goal, use key
"goal:" plus goal.id, kind goal, label goal.title and extra goal {id,title}
with fresh reads. Otherwise, if goal.pod_id is truthy, use key "team:" plus a
fresh goal.pod_id, kind team, label pods.get(fresh goal.pod_id) ?? "Team", extra
team {id:fresh goal.pod_id,name:pods.get(fresh goal.pod_id) ?? ""}. The pod Map
contains name strings. Both lookups return that stored string, with the stated
fallbacks when the lookup is null or undefined. Do not store whole pod rows or
read pod.name later while building buckets. With no team use key/kind
no_team, label "Goals without a team". Unsupported direct by values follow
the same team path; this library adds no by validation.

Flatten buckets by taking sums separately, spreading the remaining bucket
fields first and sums second. Sort descending est_list_usd_micros, then
descending requests, then native label.localeCompare. Preserve native errors
if non-string labels reach the final comparison; do not coerce them.

Return, in order: by, from, to, note, total, unallocated, unpriced_requests,
rows. The note is exactly "Costs are estimates at list price, not a bill.
Subscription usage is not money spent." unpriced_requests reads
total.unpriced_requests; rows is the sorted flattened array.

## goalSpend protocol

Run Q06 with workspace, goalId, from, to. Initialize a new total and an empty
model Map. For each supplied row, add it to total first. Look up its model;
when absent, create an independent sums object and set it using a second
row.model read. Add the row to that model sums. Flatten entries into model
followed by spread sums. Sort descending cost, descending requests, then native
model.localeCompare. Return total then by_model. No permission, visibility,
range validation or rollup read is added. This helper uses the exact same sum
addition protocol as spend, while its SQL selects raw usage only.

## Exact SQL programs

All six programs use all. Preserve their complete text, whitespace and binding
positions as listed below. SUM_COLUMNS is expanded here for each interpolated
query. These are interface data, not a copied service implementation.

Q01, bindings pp.wsId, from, from, to, to:

```sql
SELECT e.goal_id, u.session_key, s.user_id AS session_owner, u.basis, COUNT(*) AS requests, SUM(u.input) AS input, SUM(u.output) AS output, SUM(u.cache_read) AS cache_read,
            SUM(u.cache_write_5m) AS cache_write_5m, SUM(u.cache_write_1h) AS cache_write_1h, SUM(u.cache_write_unsplit) AS cache_write_unsplit,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est_list_usd_micros,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced_requests
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     JOIN v2_sessions s ON s.ws_id = u.ws_id AND s.session_key = u.session_key
     WHERE u.ws_id = ? AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.goal_id, u.session_key, u.basis
```

Q02, bindings pp.wsId, from, from, to, to:

```sql
SELECT NULLIF(goal_id, '') AS goal_id, '' AS session_key, '' AS session_owner, basis,
            SUM(requests) AS requests, SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cache_read,
            SUM(cache_write_5m) AS cache_write_5m, SUM(cache_write_1h) AS cache_write_1h, SUM(cache_write_unsplit) AS cache_write_unsplit,
            SUM(est_list_usd_micros) AS est_list_usd_micros, SUM(unpriced_requests) AS unpriced_requests
     FROM v2_spend_rollups
     WHERE ws_id = ? AND (? IS NULL OR day || 'T00:00:00.000Z' >= ?) AND (? IS NULL OR day || 'T00:00:00.000Z' < ?)
     GROUP BY goal_id, basis
```

Q03, bindings pp.wsId:

```sql
SELECT * FROM v2_goals WHERE ws_id = ?
```

Q04, bindings pp.wsId:

```sql
SELECT id, name FROM v2_pods WHERE ws_id = ?
```

Q05, bindings pp.wsId, pp.userId:

```sql
SELECT session_key, title, repo_alias, harness FROM v2_sessions WHERE ws_id = ? AND user_id = ?
```

Q06, bindings ws, goalId, from, to:

```sql
SELECT u.model, u.basis, COUNT(*) AS requests, SUM(u.input) AS input, SUM(u.output) AS output, SUM(u.cache_read) AS cache_read,
            SUM(u.cache_write_5m) AS cache_write_5m, SUM(u.cache_write_1h) AS cache_write_1h, SUM(u.cache_write_unsplit) AS cache_write_unsplit,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est_list_usd_micros,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced_requests
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND e.goal_id = ? AND u.ts >= ? AND u.ts < ?
     GROUP BY u.model, u.basis
```

The prior target mistakenly described pod-map values as whole rows. Original
source and its unchanged compiled reference map pod.id to pod.name. The second
generated candidate followed that mistaken target and was refused. Its complete
6,717-byte factory is preserved. A private one-site in-memory diagnostic matches
all 2,123 frozen records. Only the public target is corrected; original source,
private cases and expected results are unchanged.

# Every spending row retains its public bucket key

Each bucket record stores its supplied key as its first property. The record's
ordered fields are key, kind, label, the supplied extra fields, then sums.
The Map also uses that key for lookup. Storing the key only in the Map does not
preserve the public response.

When flattening bucket values, remove only the sums field, spread all remaining
record fields in their original order, then spread the numeric sums and by_basis.
Every returned spending row therefore retains key, kind and label before its
optional goal, team or session_key field and the numeric fields. Preserve the
already specified exact key strings for goal, team, session, private, others,
no_team and rolled_up buckets. The model breakdown retains its separate model
field and does not gain a spending-row key.

The third generated candidate omitted the bucket record's key field while
preserving its Map lookup key. Its complete 6,916-byte source is retained and
reviewed. A private one-site diagnostic that restores the record field matches
all 2,123 frozen original records. No generated file or expectation is patched
or admitted. Regenerate from the reviewed corrected intent and retain every
qualification, fresh-admission and actual-consumer gate.


#### Scenario: Aggregate private-safe spending and goal-model totals

- **WHEN** the Node spending target is selected
- **THEN** Capture5 resources once; preserve2 synchronous functions,2 caller types and6 exact SQL programs. Preserve five bases and nine numeric fields, epoch ownership, retained rollups, half-open intervals, unallocated usage, private goals and own-session visibility, existing bucket and model order, estimates wording, pod name string values, SQL and property-read and refusal order. No ambient clock or IO. Caller owns policy, actual storage, retention, route validation and complete reconciliation.
