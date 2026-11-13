# Node-Server-Allocation implementation Flavor

## ADDED Requirements

### Requirement: Node allocation binding [authored:node-server-allocation-v3]

# Node allocation binding

Export exactly synchronous create_allocation(resources), name create_allocation,
length 1, from the dependency-free CommonJS package server_allocation at
server_allocation/create_allocation. The package directory contains exactly
create_allocation.js and package.json as regular files, without symbolic links.
The manifest name is server_allocation, type commonjs, and exports exactly
{"./create_allocation":"./create_allocation.js"}. Build/test adapters stay
outside that runtime package.

Capture these 6 resource properties once in order, without enumeration: all,
badRequest, goalObj, canReadGoal, need, readDate. Call supplied functions with an
undefined receiver. readDate returns the current Date constructor at every
original Date lookup. There is no ambient Date, filesystem, network, process,
random, timer, Buffer or imported module dependency.

Return four named synchronous functions in order: allocation(principal,from,to),
weekStart(t), weeklyAllocation(principal,weeks=6,now=readDate().now()), and
feedAllocation(principal,now=readDate().now()). Their lengths are 3, 1, 1, 1.
Retain AllocationRow and FeedAllocation as caller-owned public TypeScript types.
There are seven static Date lookup sites. Do not cache the constructor, read a
default clock early inside factory creation or substitute another clock source.

Supplied principal, arrays and records can have getters and individual failures.
Preserve native operations, lookup order, repeated reads and exact refusal and
error identity. Preserve function receiver behavior and function metadata.
Do not clone supplied records early, memoize policy or combine query calls.

## Shared aggregation

The five exact SQL programs follow this protocol. Q01 and Q02 receive workspace,
from, from, to, to. Q03, Q04 and Q05 receive the currently read workspace value.
The fresh expression is input + output + cache_write_5m + cache_write_1h +
cache_write_unsplit, with u. on every column for Q01. Cache reads never count.
Preserve the original SQL text, parameters, joins, grouping, COALESCE, NULLIF and
raw distinct-session count. Retained rows contribute zero sessions. Bounds are
lower-inclusive and upper-exclusive; only null disables a bound in SQL.

Run Q01 then Q02. Traverse their concatenated arrays in that order. For each
row, look up its goal_id in a Map. At the first occurrence, use a shallow copy
of that complete row as the accumulator under a second goal_id read. Otherwise
update the held accumulator's fresh, est, unpriced and sessions, in that order,
using the prior accumulator value plus the current row value. Preserve Map
insertion order and return its values. Do not mutate query input records or
discard first-row extra properties through premature projection.

Percentage shares are zero unless the total is positive. Otherwise compute
the percentage and round with JavaScript Math.round to one decimal, preserving
native numeric behavior. Do not use whole-percent rounding for gap calculation.

## Window report

allocation first calls need(principal,'spend.read'). If both bounds are truthy
and from >= to, throw the exact result of badRequest('from must be before to').
Empty strings keep their original truthiness and SQL binding behavior. Do not
add a new date parser, range normalization or finite-number validation.

Read principal.wsId for the two aggregation queries, then read it again for Q03.
Map the returned full goal rows by their id. Sum every aggregate row's fresh
value for the denominator, including private, missing-goal and unbound rows.

Create private and unallocated records with keys in order kind, goal,
fresh_tokens, share, target_share, gap, est_list_usd_micros, unpriced_requests,
sessions. Both begin with null goal/target/gap and zero numeric fields; the
unallocated record is a shallow copy of private with kind unallocated.

For each aggregate, read goal_id to look up a goal only when truthy. Read it
again to choose unallocated when falsy. A present readable goal uses no combined
record: call goalObj(goal) then canReadGoal(principal,convertedGoal). Otherwise
use private. Update a combined record's tokens, estimate, unpriced requests and
sessions in order and continue. Never disclose its goal title or target.

For a readable goal, record its id in seen, compute its share, and use its
nullish target_share only when status is active. Otherwise target is null.
Emit keys kind, goal {id,title}, fresh_tokens, share, target_share, gap,
est_list_usd_micros, unpriced_requests, sessions. The gap is null without a
target, otherwise share minus target rounded to one decimal.

Then traverse goal Map values in insertion order. Short circuit when seen,
not active, target_share is null, target_share is undefined, or not readable,
in that order. Emit remaining goals with zero usage/share and gap equal to the
negative original target. Preserve zero targets and the original property reads.

Compute combined shares, sort named goal rows by descending fresh_tokens,
descending target_share with nullish treated as -1, then native title
localeCompare. Append private when its fresh_tokens is truthy, then append
unallocated when its fresh_tokens is truthy. They remain after named rows
regardless of their token count. Do not add a combined row solely for its cost.

Return keys from, to, total_fresh_tokens, total_est_list_usd_micros,
unpriced_requests, rows, note. Compute total estimate and unpriced requests by
separate original-order reductions over the aggregate rows after row assembly.
The exact note is: Agent time is counted in fresh tokens (input, output and
cache writes) for every model. Costs are estimates at list price, not a bill.

## UTC calendar weeks

weekStart constructs a Date from t through one live readDate lookup. Read its
UTC weekday and map Monday to zero. Through a second live readDate lookup,
call UTC with the date's UTC full year, month and day, then subtract that
weekday offset in 86,400,000-millisecond days. Preserve Date.UTC behavior for
years below 100 and native invalid-date results. Do not substitute local time.

weeklyAllocation evaluates omitted-argument defaults before its body, then
calls need(principal,'spend.read'). Floor weeks, clamp to at most 26 and at
least 1 using the original Math operations, then call weekStart(now). Preserve
the original NaN and coercion behavior rather than adding validation.

Visit the requested weeks oldest first through the current calendar week.
For each, separately read Date and construct the lower Monday timestamp, then
separately read Date and construct the next Monday timestamp, using toISOString.
Call allocation with that pair, including its repeated permission call. Emit
week_start, total_fresh_tokens, rows; project each row to kind, goal, share,
target_share in that order. Do not emit gaps or costs in weekly row projections.

## Feed allocation Map

Evaluate the omitted now default through live Date.now before the body. Read
principal.wsId before constructing the lower bound through another live Date
lookup. Aggregate from now minus seven days through a null upper bound. There
is no added need call here. Include all aggregates in total; retain truthy
goal_id rows in an insertion-ordered Map from goal id to fresh tokens.

Read principal.wsId for Q04 and build a Set of its goal_id values. Then read it
again for Q05, preserving that query's exact active-only filter. For each goal,
call goalObj then canReadGoal before any output. Compute one-decimal exact
share using its Map amount or zero and the full denominator, then read its
nullish target. Set its id in an output Map with keys target_share, share_7d,
gap_7d, held. share_7d rounds the one-decimal share to a whole percent. gap_7d
is null when target is null or total is exactly zero, otherwise the one-decimal
difference between the one-decimal exact share and target. It must not use the
whole-percent display share. held uses the goal id in the original hold Set.
Return this actual Map, preserving insertion order. Do not replace it with an
object, list, serialized map, per-person view or a spending permission check.


## Exact SQL programs

### Q01

```sql
SELECT e.goal_id, SUM((u.input + u.output + u.cache_write_5m + u.cache_write_1h + u.cache_write_unsplit)) AS fresh,
            COALESCE(SUM(u.est_list_usd_micros), 0) AS est,
            SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END) AS unpriced, COUNT(DISTINCT u.session_key) AS sessions
     FROM v2_usage u
     JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id
     WHERE u.ws_id = ? AND (? IS NULL OR u.ts >= ?) AND (? IS NULL OR u.ts < ?)
     GROUP BY e.goal_id
```

### Q02

```sql
SELECT NULLIF(goal_id, '') AS goal_id, SUM((input + output + cache_write_5m + cache_write_1h + cache_write_unsplit)) AS fresh, SUM(est_list_usd_micros) AS est, SUM(unpriced_requests) AS unpriced, 0 AS sessions
     FROM v2_spend_rollups
     WHERE ws_id = ? AND (? IS NULL OR day || 'T00:00:00.000Z' >= ?) AND (? IS NULL OR day || 'T00:00:00.000Z' < ?)
     GROUP BY goal_id
```

### Q03

```sql
SELECT * FROM v2_goals WHERE ws_id = ?
```

### Q04

```sql
SELECT goal_id FROM v2_goal_holds WHERE ws_id = ?
```

### Q05

```sql
SELECT * FROM v2_goals WHERE ws_id = ? AND status = 'active'
```


## Original query-array iterator and nullish lookup behavior

Exhaust the raw query array's native iterator and then the retained query
array's native iterator into a new array before processing aggregate rows.
Preserve their original length and index reads and iterator failures. Calling
concat on the supplied array adds concat and constructor lookups, can invoke
spreadability behavior, and changes subsequent refusal and query positions.
Keep the original sequential iterable spreads. Do not replace them with concat
or with a direct row-processing loop over each query array separately.

The feed amount fallback is nullish only: absent or null maps to zero. Preserve
the original numeric value otherwise, including native non-finite and signed
zero behavior. Do not apply a truthiness fallback to the Map amount.


## Exact floating-point percentage evaluation

Preserve the original sequence of JavaScript arithmetic operations for shares:
divide part by total, multiply that result by 100, multiply that result by
10 ** digits, apply Math.round, then divide by 10 ** digits. The internal
default digits value is 1. Do not combine the two multiplications into a single
1000 factor or reassociate, use toFixed, decimal arithmetic or an epsilon.
Their floating-point results differ at valid integer token ratios. In the
original service, 23 fresh tokens out of 80 produce 28.7, 41 out of 80 produce
51.2, and 51 out of 80 produce 63.7. This exact evaluation applies to window
rows, both combined rows, weekly rows and feed shares before further rounding
and gap calculations. Preserve this original behavior without silently fixing
its rounding convention. All supplied SQL inputs and expected records remain
unchanged.


#### Scenario: Preserve fresh-token shares and target gaps

- **WHEN** the Node allocation target is selected
- **THEN** Capture6 ordered resources, preserve4 synchronous functions and2 caller types,5 exact SQL programs and7 live Date sites. Preserve fresh tokens excluding cache reads, full-workspace denominator, private and unallocated grouping, active unused targets, exact percentage and gap rounding, UTC Monday calendar weeks, bounds, holds, feed Map results and exact original property/query/permission/failure order. No per-person disclosure or outcome, billing or delivery claim.
