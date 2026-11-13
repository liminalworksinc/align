# Node-Server-Steering implementation Flavor

## ADDED Requirements

### Requirement: Node steering binding [authored:node-server-steering-v2]

# Node steering service binding

Build a dependency-free CommonJS package named server_steering. The source root
contains exactly server_steering/create_steering.js and
server_steering/package.json. The manifest has name server_steering, type commonjs,
and exports {"./create_steering":"./create_steering.js"}. Both members and the
package directory are regular and are not symbolic links. Export exactly the
synchronous named function create_steering(resources), whose length is 1.

Capture these 11 resource properties exactly once in this order, without
enumerating the resource object: all, audit, get, run, tx, badRequest, nowIso,
need, ID_RE, SESSION_KEY_RE, readDate. Resource functions are called with an
undefined receiver. ID_RE and SESSION_KEY_RE remain the supplied RegExp objects;
invoke their test methods with those objects as receivers. Do not substitute
hardcoded regular expressions or validators. readDate is a captured function
that returns the currently applicable Date constructor at each original lookup.
There is no ambient Date, Buffer, console, filesystem, network, random, timer,
process or imported module dependency.

Return exactly these four named functions, in order:

| Function | Arguments in order | Length | Result |
| --- | --- | --- | --- |
| workspaceSteering | workspace id | 1 | on or off |
| writeSteering | principal, unknown value, caller time | 3 | on or off |
| ingestSteering | principal, device principal, body | 3 | Promise of intake result |
| steeringCounts | principal, from or null, to or null | 3 | aggregate object |

Only ingestSteering is async. Keep the structural caller type
Steering = "off" | "on". The caller is a thin binding, with no copied business
implementation. Do not reorder arguments for internal convenience.

## Resource interfaces

all(sql,...bindings) returns the supplied row array; get(sql,...bindings) returns
a supplied row or undefined; run(sql,...bindings) returns affected-row count.
audit(workspace,actor,action,object,time) records the existing audit event.
tx(synchronousCallback) returns a Promise for its result and owns rollback.
badRequest(message) returns the value to throw. The factory may itself throw;
preserve that same thrown or returned value, including falsy values. nowIso()
returns the recorded time string. need(principal,action) enforces the existing
permission and may throw. readDate() returns DateConstructor, supporting parse,
now and construction followed by toISOString.

The principal has wsId, userId and wsRole. The device has deviceId and user.id.
The body has events. Each event has session_key, goal_id, suggested_goal_id,
share, target and at. Session lookup rows have device_id, user_id, state.
Switch rows have steering. Daily rows have day and n. Supplied objects and
arrays may expose getters or fail at an individual read. Do not cache, reorder,
drop or add those reads merely because values are equal.

## Workspace switch

workspaceSteering queries Q01 with its primitive workspace id. Read optional
row.steering once; return on only when strictly equal to on, otherwise off.

writeSteering first compares its value against on and off and throws
badRequest("steering must be on or off") when neither matches. Then read
principal.wsId for workspaceSteering. If the effective current value differs,
run Q02 with value and a fresh principal.wsId read. Audit with fresh principal
wsId, then principal.userId, action workspace.steering_on for on or
workspace.steering_off for off, another fresh principal.wsId as object, and the
caller-supplied time. It starts no transaction, performs no need call and does
not call nowIso. A missing workspace still receives the update attempt and
audit when its effective off differs from the requested value. Return value.

## Full-batch parsing before time capture and transaction

ingestSteering first calls need(principal,"session.share"), then captures
body.events once. Require Array.isArray(events); otherwise throw
badRequest("events must be a list"). Test its length against 100, refusing a
larger array with badRequest("events: at most 100"). Invoke its native map.
For each raw entry, refuse falsy values, non-objects and arrays with
badRequest("each event must be an object"). No transaction has begun yet.

For each entry, preserve this left-to-right validation sequence:

1. Test typeof session_key string, then read session_key again for the supplied
   SESSION_KEY_RE.test. Failure: badRequest("session_key is invalid").
2. Test typeof goal_id string, then ID_RE.test on a separate goal_id read, then
   typeof suggested_goal_id string, then ID_RE.test on its separate read.
   Failure: badRequest("goal ids are invalid"). Keep the short circuits.
3. Read share and pass it to a primitive percentage helper. It requires typeof
   number, Number.isInteger, >=0 and <=100 in that order. Only after a successful
   share check read/check target in the same way. Failure:
   badRequest("share and target must be whole percents").
4. Test typeof at string. If true, call readDate() and its parse method with a
   second entry.at read. Otherwise use NaN. Require Number.isFinite(parsedAt),
   refusing with badRequest("at must be an ISO time"). Preserve the actual
   Date.parse behavior for strings; do not add stricter ISO syntax validation.
5. Return a plain parsed object with fresh reads of session_key, goal_id,
   suggested_goal_id, share, target, then the held numeric parsedAt, in that order.

After the whole map, invoke readDate().now() once and hold that server time.
Call nowIso() once and hold the recorded time. Initialize accepted zero and an
empty refused array. Await tx with a synchronous callback.

## Intake transaction and final response

Iterate parsed.entries() in native order. First compare event.at against
now + 5*60000 and now - 14*86400000, using strict > and <. Outside that interval,
append {index,reason}, whose reason reads event.at > now for clock_skew,
otherwise too_old, then continue without a session query.

For an event in range, query Q03 using fresh principal.wsId and event.session_key.
Refuse as not_shared if no row; else compare row.device_id with device.deviceId;
else compare row.user_id with device.user.id; else require row.state shared.
Keep these short circuits and read order. Append {index,reason:"not_shared"}
for any such refusal and continue.

For an eligible event, increment accepted before the INSERT and without regard
to its affected-row count. Run Q04 with principal.wsId, event.session_key,
event.goal_id, event.suggested_goal_id, event.share, event.target, then
new (readDate())(event.at).toISOString(), then the captured recorded time.
Duplicates remain accepted while INSERT OR IGNORE stores them once. A failure
retains the caller-owned transaction's rollback and exact original effects.

After successful tx, return fields accepted, refused, server_time in order.
server_time is new (readDate())(capturedNow).toISOString(), evaluated after the
commit. Do not reuse nowIso for that value or skip tx for an empty parsed batch.
Preserve a failure at this final post-commit formatting position.

## Aggregate counts

steeringCounts first calls need(principal,"spend.read"). Run Q05 with fresh
principal.wsId, from, from, to, to. It does not add a from-before-to guard.
Return steering, total, days in order. First compute workspaceSteering with a
fresh principal.wsId; then days.reduce with zero and a + day.n; then the same
supplied days array. Preserve daily ordering and the returned array reference.

## Literal SQL programs

Use these exact programs with the dispatch port and binding order above.

Q01, get, one workspace binding:
SELECT steering FROM v2_workspaces WHERE id = ?

Q02, run, value then workspace:
UPDATE v2_workspaces SET steering = ? WHERE id = ?

Q03, get, workspace then session key:
SELECT device_id, user_id, state FROM v2_sessions WHERE ws_id = ? AND session_key = ?

Q04, run, eight bindings in the intake order:
INSERT OR IGNORE INTO v2_steering_events (ws_id, session_key, goal_id, suggested_goal_id, share, target, at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)

Q05, all, workspace then from twice and to twice:
SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM v2_steering_events WHERE ws_id = ? AND (? IS NULL OR at >= ?) AND (? IS NULL OR at < ?) GROUP BY day ORDER BY day

The stored event uniqueness and real application migrations remain caller-owned.
The public contract and package contain no private fixtures, frozen observations
or copied original service implementation. Source-derived private acceptance,
normal fresh qualification, separate admission, actual caller/store integration
and the complete parent gates are required before source authority transfer.


#### Scenario: Preserve steering controls and reported events

- **WHEN** the Node steering target is selected
- **THEN** Capture11 resources, preserve4 runtime functions,1 caller type,5 literal SQL programs and4 live Date lookups. Preserve exact switch behavior, caller-owned write transaction, validation-before-transaction, own-device/person/shared-session isolation, inclusive time boundaries, duplicate acceptance, refusal indexes and codes, daily counts, exact getters and failures. Events are reported metadata, not verified behavior or weekly allocation improvement.
