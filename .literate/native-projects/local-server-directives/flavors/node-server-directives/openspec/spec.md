# Node-Server-Directives implementation Flavor

## ADDED Requirements

### Requirement: Node session directive binding [authored:node-server-directives-v2]

# Node session directives binding

## Package and resources

Export `create_directives(resources)` from dependency-free CommonJS package
`server_directives`. Its only two files are `create_directives.js` and
`package.json`, with export map
`{"./create_directives":"./create_directives.js"}`. Export only create_directives,
a synchronous function with that name and length 1. CommonJS and ESM imports
expose the identical factory. Keep root build/test adapters outside this package.

Capture these 21 supplied resources exactly once, in order:

`all, get, run, tx, V2Error, badRequest, notFound, event, newId, nowIso, goalCore,
goalObj, bindableFor, goalRow, canReadGoal, principalIn,
expireStoppedSessionTargets, holdWire, requestReceipt, requestWire, readDate`.

Do not enumerate resources, defer their capture or replace them. Call supplied
functions as bare calls with original arguments and identity. V2Error is the
supplied constructor, used with new. Keep grants.has and grants iteration on the
supplied object with its receiver. readDate() returns the live Date constructor:
read it separately at each original Date lookup, including the default now
expression and the later cutoff constructor. Do not hold a private clock or
capture Date once. No ambient Date, console, process, filesystem, environment,
network, timer, randomness or application imports are permitted.

Return exactly these enumerable own members in order. Preserve function names,
lengths and synchronous versus asynchronous kinds:

| Member | Kind | Length |
| --- | --- | --- |
| writeDirective | synchronous function | 6 |
| goalTargets | synchronous function | 2 |
| goalVersionDirective | synchronous function | 2 |
| goalSnapshot | synchronous function | 1 |
| directivesFor | synchronous function | 2 |
| endedSessionsFor | synchronous function | 1 |
| parseCursor | synchronous function | 1 |
| RECEIPT_STATES | live array value | |
| recordReceipt | async function | 5 |
| stopStatus | synchronous function | 2 |

Optional extra in writeDirective has no runtime default initializer. Omitting it
passes undefined through the existing six-parameter function. An initializer
such as extra = undefined would reduce function.length to 5 and is forbidden.

The caller retains the five public types DirectiveKind, Binding, DirectiveExtra,
Directive and ReceiptState. Do not add runtime implementations for types.
RECEIPT_STATES is the public array in order received, applied, enforced, accepted,
declined. Keep the same array reference across reads from one factory result.

Preserve native truthiness, nullish choices, short circuiting, JSON operations,
array/object property order, repeated field accesses, iterators and thrown values.
Do not pre-read inputs, normalize accepted data, copy arrays in advance, change
query text or cache service results. Property and supplied-effect failures retain
their original partial trace and durable transaction result. Native errors stay
native; do not replace JSON or Date errors with validation errors.

## Host toolchain

The selected JavaScript Flavor owns the Node host toolchain, its compatible
version constraint and executable/version probe. Use that selected toolchain for
build, tests and runtime checks. This library adds no third-party source package;
the executable adapters use only built-ins. Distinguish the selected host from
an additional source dependency. Do not introduce a second unresolved Node.js
source-package range for the existing toolchain. Report any real additional
dependency with normal lock/evidence requirements. Preserve all normal host,
source dependency and SBOM gates; invent no version and edit no generated SBOM.

## Writing and target selection

writeDirective takes ws, kind, sessionKeys, goal, binding and optional extra.
First spread a new Set of sessionKeys, preserving first-insertion order. If that
array is empty, return null immediately, with no id, timestamp, write or event.
Otherwise call newId("dir"). Run Q01 with id, ws, kind, then
`goal?.id ?? extra?.goalId ?? null`, a JSON string of truthy goal or null, a JSON
string of truthy binding or null, a JSON string of extra.request only when its
optional truthiness test succeeds, similarly extra.hold, and nowIso(), in that
order. Preserve the repeated extra.request/extra.hold reads after their tests.
For each deduplicated key, run Q02 with ws, id, key, in insertion order. Finally
call event("first_directive", {ws, props: {kind}}), then return id. The supplied
event owns its deduplication. Do not create a transaction, catch a partial write
or move the event. The caller owns atomicity for this writer.

goalTargets runs Q03 with ws, goalId, goalId and maps each session_key in the
returned order. It includes non-stopped sessions bound by an open epoch or
governed by that goal, including suspended sessions and other workspace users.
Do not add device, person or shared-only filters. goalVersionDirective evaluates
goalTargets(ws, goal.id) before goalCore(goal), then delegates to writeDirective
with kind goal_version and binding null. Preserve this argument evaluation order.

## Saved snapshots and serialization

goalSnapshot parses the supplied JSON, takes pod and visibility out of the
parsed value and spreads all remaining own enumerable fields into the result.
Then write team as rest.team ?? pod ?? null; level as rest.level ?? "team";
visibility as "team" only when the held visibility is exactly "pod", otherwise
the held visibility; limits as rest.limits ?? []; target_share as
rest.target_share ?? null. Preserve unknown saved fields, zero, false and empty
strings where nullish fallback does not apply. Add no schema validation or
sanitization. Arrays, primitives, malformed JSON and null retain native behavior.

For each feed row, first call principalIn(device, row.ws_id), even if no goal
snapshot is present. Start goal as null. Only for truthy row.goal_json look up
the live goal: for truthy row.goal_id call goalRow(row.ws_id, row.goal_id), else
use undefined. Only when that live value exists and
canReadGoal(principal, goalObj(live)) succeeds, parse the saved goal snapshot and
spread it with bindable from bindableFor(principal, live). Never parse hidden or
missing-live-goal JSON. Read saved data rather than substituting the live goal.

The wire object's base members are id, seq, ws from ws_id, kind, session_keys,
goal, binding from parsing truthy binding_json or null, and created_at, in order.
Only when kind is request, append request from requestWire(principal,
JSON.parse(row.request_json)) for truthy request_json, otherwise null. Only for
kind hold or release, append hold from holdWire(principal, row.kind, row.goal_id,
JSON.parse(row.hold_json)) when both hold_json and goal_id are truthy, otherwise
null. Do not add request/hold keys to other kinds. Preserve repeated kind,
goal_id, JSON-field and argument property reads, including short circuiting.

## Device feed, ended sessions and cursor

directivesFor takes device, cursor and optional limit defaulting to 100. Spread
device.grants into workspace ids in their original iteration order. An empty
list returns [] before any other service work. Run Q04 with device.deviceId,
device.user.id, cursor, each workspace id and the supplied limit, in order.
The page is raw SQL group/order/limit behavior, with no clamping or refill.
Map each row through the serializer, supplying row.keys split on a single space
and sorted by native JavaScript string sort. This explicit sort is required even
if a particular SQLite plan happens to return already sorted targets.

endedSessionsFor takes device and optional nowMs, whose default evaluates
readDate().now() before entering the body, including when there are no grants.
Spread the grants; empty returns []. Otherwise run Q05 with device.user.id,
the ISO string from a new live Date at nowMs minus 30 * 86400000, then workspace
ids. A caller-supplied nowMs skips only the default clock read, not the Date
constructor lookup. Include stopped sessions across every device of this person
in granted workspaces. The cutoff is inclusive, newest first, at most 200.
Map ws_id to ws, then session_key, ended_reason ?? null, stopped_at. Do not
restrict to the asking device or change native invalid-Date behavior.

parseCursor returns 0 only for null or the empty string. Otherwise apply exactly
the native regex /^\d{1,15}$/ to the supplied value; on failure throw the result
of badRequest("cursor must be a sequence number"). On success return Number of
the original value. Do not trim, add type checks, use parseInt, alter native end
anchor behavior or reject values the native regex coercion accepts.

## Receipt ownership, expiry and replay

recordReceipt takes device, directiveId, sessionKey, state, at and optional
autoAccepted default false. It is always async, including early refusals. First
run Q06 with directiveId, sessionKey, device.user.id, device.deviceId. If no row,
or device.grants.has(row.ws_id) is false, throw the result of notFound().
Preserve short circuiting: a missing row does not read grants.

Hold answer as state exactly accepted or declined. If answer and row.kind is not
request, throw badRequest("accepted and declined answer a request directive").
Next if autoAccepted is truthy and state is not accepted, throw
badRequest("auto_accepted goes only with state accepted"). Parse request only
when row.kind is request and row.request_json is truthy; otherwise null. Keep
the original repeated kind and request_json reads. Parsing precedes transactions.

If answer, request and row.session_state exactly stopped, await the supplied tx
with a synchronous callback that calls expireStoppedSessionTargets(row.ws_id,
sessionKey, nowIso()). After that transaction resolves and commits, throw a new
supplied V2Error with status 409, code request_expired, message exactly
`This request expired: this session's sharing was stopped, so it no longer takes answers.`,
and details {ended_reason: row.ended_reason ?? null}. A successful expiry remains
committed even though the answer is refused. The expiry callback returns the exact
value from expireStoppedSessionTargets to the supplied transaction. That port
returns its numeric write count, including zero. Do not discard the value in a
block callback or replace it with undefined. The transaction owns observation
and resolution of its callback result even though the outer function later
refuses the answer. An expiry failure rolls back and
propagates unchanged. Do not move the refusal inside the expiry transaction.
Delivery receipts for a stopped session continue through the ordinary path.
An absent or parsed-null request does not enter the stopped-answer expiry path.

Otherwise return the supplied tx with one synchronous callback. Run Q07 with
row.ws_id, directiveId, sessionKey, state, at, nowIso(), and autoAccepted ? 1 : 0.
Hold the write count. If request is falsy return {fresh: count > 0}. Otherwise
return {fresh: count > 0, request_state: requestReceipt(row.ws_id,
request.request_id, sessionKey, state, autoAccepted, device.user.id)}. Preserve
the later live user id read, raw autoAccepted argument, and requestReceipt call
even for a duplicate receipt with zero writes. The original uniqueness includes
state and auto_accepted, so an automatic answer and a later manual answer each
record once. Add no validation for state or at beyond the original checks.

## Stop status

stopStatus runs Q08 with ws and sessionKey. No row returns null. Otherwise run
Q09 with the returned directive id and sessionKey, then return directive_id,
kind, created_at and receipts in that order. Select the latest stop or resume
by descending directive sequence; order receipts by at as SQL declares.

## Exact SQL programs

The following programs and binds retain their literal spacing and line breaks.
In Q04 and Q05, the interpolated ws.map expression creates one question mark per
held workspace id, comma separated without spaces. The Date expression in a bind
means a fresh supplied readDate lookup at that original site.

Q01, supplied `run`, 9 bind expressions:

```sql
INSERT INTO v2_directives (id, ws_id, kind, goal_id, goal_json, binding_json, request_json, hold_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Binds in order: `id`, `ws`, `kind`, `goal?.id ?? extra?.goalId ?? null`, `goal ? JSON.stringify(goal) : null`, `binding ? JSON.stringify(binding) : null`, `extra?.request ? JSON.stringify(extra.request) : null`, `extra?.hold ? JSON.stringify(extra.hold) : null`, `nowIso()`.

Q02, supplied `run`, 3 bind expressions:

```sql
INSERT INTO v2_directive_targets (ws_id, directive_id, session_key) VALUES (?, ?, ?)
```

Binds in order: `ws`, `id`, `k`.

Q03, supplied `all`, 3 bind expressions:

```sql
SELECT s.session_key FROM v2_sessions s
     LEFT JOIN v2_epochs e ON e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.ends_at IS NULL
     WHERE s.ws_id = ? AND s.state <> 'stopped' AND (e.goal_id = ? OR s.governing_goal_id = ?)
     ORDER BY s.session_key
```

Binds in order: `ws`, `goalId`, `goalId`.

Q04, supplied `all`, 5 bind expressions:

```sql
SELECT d.seq, d.id, d.ws_id, d.kind, d.goal_id, d.goal_json, d.binding_json, d.request_json, d.hold_json, d.created_at, group_concat(t.session_key, ' ') AS keys
     FROM v2_directives d
     JOIN v2_directive_targets t ON t.directive_id = d.id
     JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE s.device_id = ? AND s.user_id = ? AND d.seq > ? AND d.ws_id IN (${ws.map(() => "?").join(",")})
     GROUP BY d.seq ORDER BY d.seq LIMIT ?
```

Binds in order: `dev.deviceId`, `dev.user.id`, `cursor`, `...ws`, `limit`.

Q05, supplied `all`, 3 bind expressions:

```sql
SELECT ws_id, session_key, ended_reason, stopped_at FROM v2_sessions
     WHERE user_id = ? AND state = 'stopped' AND stopped_at >= ? AND ws_id IN (${ws.map(() => "?").join(",")})
     ORDER BY stopped_at DESC LIMIT 200
```

Binds in order: `dev.user.id`, `new Date(nowMs - ENDED_LOOKBACK_MS).toISOString()`, `...ws`.

Q06, supplied `get`, 4 bind expressions:

```sql
SELECT t.ws_id, d.kind, d.request_json, s.state AS session_state, s.ended_reason FROM v2_directive_targets t
     JOIN v2_directives d ON d.id = t.directive_id
     JOIN v2_sessions s ON s.ws_id = t.ws_id AND s.session_key = t.session_key
     WHERE t.directive_id = ? AND t.session_key = ? AND s.user_id = ? AND s.device_id = ?
```

Binds in order: `directiveId`, `sessionKey`, `dev.user.id`, `dev.deviceId`.

Q07, supplied `run`, 7 bind expressions:

```sql
INSERT OR IGNORE INTO v2_receipts (ws_id, directive_id, session_key, state, at, recorded_at, auto_accepted) VALUES (?, ?, ?, ?, ?, ?, ?)
```

Binds in order: `t.ws_id`, `directiveId`, `sessionKey`, `state`, `at`, `nowIso()`, `autoAccepted ? 1 : 0`.

Q08, supplied `get`, 2 bind expressions:

```sql
SELECT d.id, d.kind, d.created_at FROM v2_directives d JOIN v2_directive_targets t ON t.directive_id = d.id
     WHERE t.ws_id = ? AND t.session_key = ? AND d.kind IN ('stop','resume') ORDER BY d.seq DESC LIMIT 1
```

Binds in order: `ws`, `sessionKey`.

Q09, supplied `all`, 2 bind expressions:

```sql
SELECT state, at FROM v2_receipts WHERE directive_id = ? AND session_key = ? ORDER BY at
```

Binds in order: `d.id`, `sessionKey`.


#### Scenario: Preserve structured directives, owned receipts and committed expiry before refusal

- **WHEN** the Node session directives target is selected
- **THEN** Preserve the real numeric expiry callback result to tx before refusal; do not discard it. Keep optional extra without a runtime default so writeDirective.length stays6. Capture 21 resources in order once and expose the original ten values, nine exact SQL programs and two live Date sites. Preserve all original defaults, synchronous metadata, async receipt behavior, caller-owned types, write no-op/deduplication/order and caller transaction ownership, open-epoch/governing targets, saved snapshot legacy fields, readership-gated goal parsing, request/hold kind shapes, device/person/grant feeds, native key sort and cursor regex, inclusive thirty-day ended sessions across devices and two hundred bound. Preserve receipt ownership and grants before state validation, idempotence including automatic/manual distinction, request transition on replay, expiry transaction committed before 409 refusal, exact error identity/details and stop/resume sequence selection. No new ambient IO, policy, content read or delivery/completion claim.
