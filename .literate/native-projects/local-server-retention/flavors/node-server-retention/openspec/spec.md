# Node-Server-Retention implementation Flavor

## ADDED Requirements

### Requirement: Retention and Former-Member Identity target binding [authored:node-server-retention-v2]

# JavaScript retention binding

Provide CommonJS package `server_retention` with exactly `package.json`,
`create_retention.js` and `create_retention_runner.js`. Package name and type are
`server_retention` and `commonjs`; export paths map `./create_retention` and
`./create_retention_runner` to their matching `.js` files. Each module exports its
one named synchronous factory, length 1. No imports or ambient I/O, clock,
environment, randomness, timers, console or global process state are used inside
these generated modules. All such effects use explicit supplied ports.

Use the Node host selected and probed by the JavaScript Flavor. No additional
source package or invented host version is required. Preserve normal toolchain,
lock and SBOM checks. RetentionCounts and Tx remain caller-owned TypeScript
interfaces, not extra files or runtime implementations in this three-file package.

## Core resources and public metadata

`create_retention` captures once, without enumeration, in order: `eventActor`,
`purgeWorkspace`, `RESTORE_DAYS`, `sessionMaxDays`, `testIdpEnabled`, `readDate`,
`readProcessEnv`. Preserve identity, receiver, timing and failure of every supplied
call. Database methods use the database receiver; standalone resources and `tx`
use an undefined receiver. Obtain the Date constructor through `readDate()` at
each date use; obtain implicit environment through `readProcessEnv()` at the
corresponding default evaluation. Do not access resources speculatively.

Return own enumerable API names in exact order: RESTORE_DAYS, FORMER_MEMBER_DAYS,
SESSION_MONTHS, AUDIT_MONTHS, INVITE_GRACE_DAYS, ACCESS_REQUEST_MONTHS, EVENT_MONTHS,
CLOSED_ASK_MONTHS, VALUE_REPORT_MONTHS, REQUEST_MONTHS, DELETED_SESSION_MONTHS,
RETENTION_INTERVAL_MS, retentionNow, formerMemberId, personName, PERSON_COLUMNS,
workspacesNaming, noteDeparture, cancelDeparture, pseudonymise,
deleteOrphanDirectives, runRetention, describeCounts.

Constants are the supplied RESTORE_DAYS, 30 former-member days, 13 session months,
12 audit months, seven invitation grace days, 13 months for each of the remaining
month lifetimes, and 86,400,000 milliseconds for the interval. PERSON_COLUMNS has
the exact 30 ordered table/column pairs in the public target-data record. Its array
reference is stable per factory and remains unfrozen at runtime.

Functions retain exact names and lengths: retentionNow 0, formerMemberId 1,
personName 2, workspacesNaming 2, noteDeparture 4, cancelDeparture 3, pseudonymise 5,
deleteOrphanDirectives 1, runRetention 4, describeCounts 1. Only runRetention is an
AsyncFunction. Defaults, destructuring and optional arguments retain their existing
JavaScript evaluation and property-read order.

## Identity and scope operations

- `retentionNow(env=process.env)` uses the supplied test-identity gate. Only when
  that gate is true and ALIGN_TEST_NOW is truthy does it parse that value; a finite
  parsed timestamp gives that date. Otherwise return the supplied clock's current
  date. The hosted prohibition is enforced by the supplied gate.
- `formerMemberId(n)` returns `fm_` followed by the normal string conversion of n.
  `personName(id,name)` recognizes the anchored decimal former-member grammar;
  it returns `Former member #<digits>` in that case, otherwise `name` when non-null
  and `Former member` when null or undefined. Empty names remain empty.
- `workspacesNaming(db,user)` unions the exact thirty column queries, workspace
  creator, pending former membership, approval JSON text, directive goal owner,
  directive hold owner and invite accepted-by queries. Preserve returned row order.
- `noteDeparture(db,ws,user,at)` inserts-or-ignores the pending departure.
  `cancelDeparture(db,ws,user)` deletes only a pending row with null pseudonym n.
- `pseudonymise(db,ws,user,at,secret)` allocates one more than the workspace's
  current maximum pseudonym n, updates the pending row or inserts a new former
  row, then resolves the user's lowercased email. Delete matching invitations in
  this workspace; clear device IDs on the person's sessions here; clear the
  matching `eventActor(secret,user)` here; replace all PERSON_COLUMNS references,
  workspace creator, approval JSON text, directive goal owner object and hold
  owner here. Preserve exact operation order. Return the new pseudonym. It runs
  inside its caller's transaction and introduces none of its own.
- `deleteOrphanDirectives(db)` deletes directives without any target and returns
  the database's change count.

## Retention schedule and counts

`runRetention(db,tx,now,{dryRun=false,env=process.env,secret})` constructs all fifteen
counts at zero in this order: workspaces_purged, sessions_rolled_up,
usage_rows_rolled_up, former_members_pseudonymised, audit_rows_deleted,
codes_deleted, sign_in_sessions_deleted, activity_deleted, invites_deleted,
access_requests_deleted, events_deleted, asks_deleted, value_reports_deleted,
requests_deleted, deleted_session_markers_deleted.

Run these eleven steps in this exact execution order:

1. Select deleted workspaces with `deleted_at <= now minus RESTORE_DAYS` and call
   supplied purgeWorkspace(db,id), incrementing the workspace count.
2. Select requests with created_at strictly before thirteen calendar months ago.
   Delete each request and its request-kind directives by JSON request ID.
3. Select sessions whose stopped_at, or otherwise maximum of row updated_at,
   latest usage received_at and latest epoch created_at, is strictly before the
   thirteen-month boundary. Count usage, add its joined epoch usage to rollups,
   delete the session and increment session/usage counts. If any sessions were
   selected, delete orphan directives. Rollups group by workspace, coalesced goal,
   UTC day, model and basis; all nine aggregate fields add on conflict.
4. Select unpseudonymised departures with removed_at at or before thirty days
   ago, ordered by removed_at then rowid. Cancel a departure if membership resumed;
   otherwise pseudonymise it and increment the former-member count.
5. Delete audit rows strictly before twelve calendar months ago.
6. If the external verification table exists, delete expired values strictly
   before now. If the external session table exists, delete sessions strictly
   past expiresAt or strictly past their absolute creation-age cap supplied by
   sessionMaxDays(env). Delete expired activity strictly before now and unaccepted
   invitations whose expiry is strictly before seven days ago.
7. Delete pending access requests based on creation time, and other access
   requests based on decision time falling back to creation, strictly before the
   thirteen-month boundary.
8. Delete product events strictly before thirteen calendar months ago.
9. Delete mentions of closed asks, then asks, for done, declined or withdrawn
   states strictly older than thirteen months by updated_at. Preserve open and
   accepted asks.
10. Delete value reports strictly older than thirteen months by updated_at.
11. If the deleted-session marker table exists, delete markers strictly older
    than thirteen months.

Use UTC month subtraction with Date.setUTCMonth, including its existing overflow
behavior. Day subtraction uses fixed 86,400,000 millisecond days. The public SQL
target-data record specifies statement text and dynamic slots. Preserve parameter
order, optional-table probes and all row iteration. The rollup aggregate tuple is
requests, input, output, cache_read, cache_write_5m, cache_write_1h,
cache_write_unsplit, est_list_usd_micros, unpriced_requests. Unpriced cost sums
coalesce to zero and unpriced request count uses null cost.

For a real run, await one `tx` callback per step in sequence. For a dry run, await
one `tx` that invokes all steps then throws a private Symbol with description
`dry run`; catch only that exact symbol and return counts. Any other thrown or
rejected value escapes unchanged. `describeCounts` enumerates the supplied count
object in its own order, replacing underscores in each key with spaces and joining
`<name> <value>` entries with comma-space. It emits no identity or private content.

## Public SQL target-data slots

The selected data record is `server-retention.public-target-data-v3.json`. Use
literal whitespace, argument ordering and dynamic expansions exactly. Its
argument-expression counts distinguish a source expression inventory from runtime
variadic arity.

Query 1 is the computed person-reference union: for every ordered PERSON_COLUMNS
pair use `SELECT ws_id FROM <table> WHERE <column> = ?1 AND ws_id IS NOT NULL`,
then append these six literal statements in order:

1. `SELECT id AS ws_id FROM v2_workspaces WHERE created_by = ?1`
2. `SELECT ws_id FROM v2_former_members WHERE user_id = ?1`
3. `SELECT ws_id FROM v2_alignment_revisions WHERE instr(approvers_json, ?1) > 0`
4. `SELECT ws_id FROM v2_directives WHERE goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?1`
5. `SELECT ws_id FROM v2_directives WHERE hold_json IS NOT NULL AND json_extract(hold_json, '$.by') = ?1`
6. `SELECT ws_id FROM v2_invites WHERE accepted_by = ?1`

Join with literal ` UNION ` and bind only userId. Query 12 substitutes table,
column and the same column from each ordered pair; bind pseudonym, workspace,
user. Query 19's first slot is ROLLUP_SUMS joined by comma-space; its second is
the ordered `<column> = <column> + excluded.<column>` assignments joined by
comma-space. Bind workspace, session key. Queries 36 and 37 substitute exactly
`state IN ('done','declined','withdrawn') AND updated_at < ?`; bind the closed-ask
calendar cutoff. All other templates are literal. The public operation contracts
above determine values and ordering for each positional parameter.

## Scheduling factory

`create_retention_runner` captures once in order: `core`, `runRetention`,
`globalState`, `readConsole`, `readSetInterval`. Return a plain object with exactly one own enumerable member, `startRetention`.
Its value is a named AsyncFunction `startRetention`, length 1. The factory itself
is a synchronous ordinary function of length 1. Its call always first awaits a logged run:
call `runRetention(core.retentionNow())`; if any Object.values(counts) value is
greater than zero, call `readConsole().log` with `Align retention: ` followed by
`core.describeCounts(counts)`. Keep method receivers on core and console.

Catch a logged run's failure and call `readConsole().error` with exactly
`Align retention failed:` and, hosted, the error's optional name falling back
with nullish semantics to `unknown`; locally, pass the original error value.
Logging itself can throw and retains existing propagation. After the initial
logged run, inspect `globalState.__alignRetention`. Return if truthy; otherwise
obtain the interval function with `readSetInterval()`, then call that function
with an undefined receiver, a callback that starts a logged run without awaiting
it, and `core.RETENTION_INTERVAL_MS`. Store its exact returned
handle on globalState.__alignRetention, then reread that property before invoking
its optional unref as a method. Do not substitute a held local handle for that
observable state read. A non-null non-callable unref keeps its native error.
Do not schedule before the initial run or skip that run on repeat invocation.


## Database port and timestamp representation

The supplied database implements the existing caller-owned Sql interface:
run(sql,...params) returns the numeric change count; get(sql,...params) returns
one row or undefined; all(sql,...params) returns an array of rows. Each run result
is already a number. Add that number directly to its declared retention count.
deleteOrphanDirectives returns the run result directly. noteDeparture and
cancelDeparture discard their run result and return undefined.

All timestamp parameters in this contract are UTC ISO strings from toISOString.
This includes external verification and sign-in session expiry columns. The
public query_bindings table identifies each parameter in source order. Numeric
millisecond arithmetic happens before constructing and formatting its Date.

daysBefore obtains the supplied Date constructor, then reads now.getTime,
subtracts the day count times 86400000, constructs that timestamp and formats it.
monthsBefore obtains the Date constructor, reads now.getTime and constructs a
numeric timestamp copy, then reads getUTCMonth, calls setUTCMonth with the
subtracted month count and formats it. Retain UTC overflow behavior and each
separate provider lookup. Pass the numeric timestamp rather than the now object
to the constructor. Preserve errors and their original evaluation point.

retentionNow first resolves its environment default, then calls testIdpEnabled.
When that result and env.ALIGN_TEST_NOW are truthy, obtain readDate().parse and
read env.ALIGN_TEST_NOW again as its argument. If the parsed number is finite,
obtain readDate() again and construct that numeric timestamp. Otherwise obtain
readDate() for the default current-date construction. The parse and successful
construction are separate supplied Date lookups. No Date constructor is cached
across those uses or calls.

## Exact row reads, counts and identity rewrites

For each selected old session, read its ws_id then session_key exactly once at
entry to the roll-up operation. Hold those two values across Q18, Q19 and Q20.
Q18's optional n uses nullish zero and is read before Q19. Q19 adds rollups;
Q20 deletes the session. Add the held usage count to usage_rows_rolled_up, then
increment sessions_rolled_up once. After all selected sessions, read the returned
array length and run Q17 only when it is truthy. Do not reread the session row's
fields between its three database operations.

Each old request's Q24 numeric return increments requests_deleted immediately,
then Q25 executes. Read that row's id separately for Q24 and Q25, in that order.
All other deletion counters use += with their corresponding numeric run result,
preserving a supplied zero or other numeric result. Workspace purge count and
former-member pseudonymised count increment once per performed operation.

In the former-member step, compute now.toISOString once before the Q27 cutoff
and selection. Reuse it for every pseudonymisation in that step. Read a selected
row's ws_id and user_id for Q28, then read both again when calling the chosen
cancelDeparture or pseudonymise branch.

In the expiry step, compute now.toISOString once before any table probe. Probe
ba_verification, then perform Q30 if present. Probe ba_session, then perform Q31
if present; its second parameter is the ISO day cutoff derived from
sessionMaxDays(env), in that argument-evaluation order. Q32 uses the held ISO now;
Q33 computes its invitation cutoff afterward. Preserve the conditional omission
of a query and its cutoff computation when its table is absent.

Approval JSON text rewriting uses plain raw strings. Q14 binds userId, the new
pseudonym, wsId, userId. Replace each occurrence of the raw user ID in that text,
including occurrences inside prefixed strings such as sessions:<userId>. No JSON
quoting, parsing, reserialization or new filtering changes this existing rewrite.
The other ordered Q12 through Q16 identity updates retain their public bindings.

The private rollback Symbol with description dry run is created once for a
factory instance and is reused by that instance's dry runs. A dry run invokes
all eleven steps synchronously inside its one tx callback, throws that exact
Symbol and catches only that identity. A real run awaits eleven zero-argument
tx callbacks in order. Each step receives the same db, now, counts and held env
and secret values. Source-owned cutoffs remain inside their corresponding step.

## Public ordered query bindings

The query_bindings record below gives positional parameter meanings for all 39
SQL inventory entries. Its slots are public target-port data, not an executable
implementation. Preserve the existing SQL text, dynamic expansions, conditionals
and row reads described above.

## Public target data

The complete data record below is normative SQL, constants, public types and ordered port bindings.

```json
{
  "schema": "align/public-node-port-data@1",
  "component": "server-retention",
  "original_source": "lib/v2/retention-core.mts",
  "original_source_sha256": "33468b861fc72c65505337326cacac89d9d2b9e21c180efbded66f3d06a8208f",
  "constants": {
    "FORMER_MEMBER_DAYS": 30,
    "SESSION_MONTHS": 13,
    "AUDIT_MONTHS": 12,
    "INVITE_GRACE_DAYS": 7,
    "ACCESS_REQUEST_MONTHS": 13,
    "EVENT_MONTHS": 13,
    "CLOSED_ASK_MONTHS": 13,
    "VALUE_REPORT_MONTHS": 13,
    "REQUEST_MONTHS": 13,
    "DELETED_SESSION_MONTHS": 13,
    "RETENTION_INTERVAL_MS": 86400000,
    "PERSON_COLUMNS": [
      [
        "v2_invites",
        "created_by"
      ],
      [
        "v2_goals",
        "owner_id"
      ],
      [
        "v2_goal_versions",
        "created_by"
      ],
      [
        "v2_audit",
        "actor_id"
      ],
      [
        "v2_audit",
        "object_id"
      ],
      [
        "v2_alignments",
        "requester_id"
      ],
      [
        "v2_alignments",
        "revoked_by"
      ],
      [
        "v2_alignment_revisions",
        "author_id"
      ],
      [
        "v2_alignment_approvals",
        "user_id"
      ],
      [
        "v2_sessions",
        "user_id"
      ],
      [
        "v2_activity",
        "user_id"
      ],
      [
        "v2_change_requests",
        "requester_id"
      ],
      [
        "v2_change_requests",
        "approved_by"
      ],
      [
        "v2_change_requests",
        "rejected_by"
      ],
      [
        "v2_change_requests",
        "launch_by"
      ],
      [
        "v2_change_request_revisions",
        "author_id"
      ],
      [
        "v2_change_request_revisions",
        "acknowledged_by"
      ],
      [
        "v2_change_request_evidence",
        "added_by"
      ],
      [
        "v2_asks",
        "created_by"
      ],
      [
        "v2_asks",
        "decided_by"
      ],
      [
        "v2_ask_mentions",
        "added_by"
      ],
      [
        "v2_value_reports",
        "person_id"
      ],
      [
        "v2_requests",
        "sender_id"
      ],
      [
        "v2_requests",
        "cancelled_by"
      ],
      [
        "v2_goal_holds",
        "held_by"
      ],
      [
        "v2_reallocations",
        "requester_id"
      ],
      [
        "v2_reallocations",
        "launch_by"
      ],
      [
        "v2_reallocations",
        "decided_by"
      ],
      [
        "v2_reallocation_revisions",
        "author_id"
      ],
      [
        "v2_reallocation_approvals",
        "user_id"
      ]
    ],
    "ROLLUP_SUMS": [
      "requests",
      "input",
      "output",
      "cache_read",
      "cache_write_5m",
      "cache_write_1h",
      "cache_write_unsplit",
      "est_list_usd_micros",
      "unpriced_requests"
    ]
  },
  "sql": [
    {
      "operation": "workspacesNaming",
      "source_line": 116,
      "method": "all",
      "statement": {
        "text": null,
        "slots": null,
        "computed_plan": true
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "noteDeparture",
      "source_line": 122,
      "method": "run",
      "statement": {
        "text": "INSERT OR IGNORE INTO v2_former_members (ws_id, user_id, removed_at) VALUES (?, ?, ?)",
        "slots": 0
      },
      "argument_expression_count": 3,
      "variadic_arguments_present": false
    },
    {
      "operation": "cancelDeparture",
      "source_line": 127,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_former_members WHERE ws_id = ? AND user_id = ? AND n IS NULL",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 135,
      "method": "get",
      "statement": {
        "text": "SELECT MAX(n) AS n FROM v2_former_members WHERE ws_id = ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 136,
      "method": "get",
      "statement": {
        "text": "SELECT rowid AS id, removed_at FROM v2_former_members WHERE ws_id = ? AND user_id = ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 137,
      "method": "run",
      "statement": {
        "text": "UPDATE v2_former_members SET user_id = NULL, n = ?, pseudonymised_at = ? WHERE rowid = ?",
        "slots": 0
      },
      "argument_expression_count": 3,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 138,
      "method": "run",
      "statement": {
        "text": "INSERT INTO v2_former_members (ws_id, user_id, n, removed_at, pseudonymised_at) VALUES (?, NULL, ?, ?, ?)",
        "slots": 0
      },
      "argument_expression_count": 4,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 140,
      "method": "get",
      "statement": {
        "text": "SELECT lower(email) AS email FROM ba_user WHERE id = ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 141,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_invites WHERE ws_id = ? AND (accepted_by = ? OR (? IS NOT NULL AND lower(email) = ?))",
        "slots": 0
      },
      "argument_expression_count": 4,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 142,
      "method": "run",
      "statement": {
        "text": "UPDATE v2_sessions SET device_id = NULL WHERE ws_id = ? AND user_id = ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 143,
      "method": "run",
      "statement": {
        "text": "UPDATE v2_events SET actor = NULL WHERE ws_id = ? AND actor = ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 144,
      "method": "run",
      "statement": {
        "text": "UPDATE <slot-1> SET <slot-2> = ? WHERE ws_id = ? AND <slot-3> = ?",
        "slots": 3
      },
      "argument_expression_count": 3,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 145,
      "method": "run",
      "statement": {
        "text": "UPDATE v2_workspaces SET created_by = ? WHERE id = ? AND created_by = ?",
        "slots": 0
      },
      "argument_expression_count": 3,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 148,
      "method": "run",
      "statement": {
        "text": "UPDATE v2_alignment_revisions SET approvers_json = replace(approvers_json, ?, ?) WHERE ws_id = ? AND instr(approvers_json, ?) > 0",
        "slots": 0
      },
      "argument_expression_count": 4,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 150,
      "method": "run",
      "statement": {
        "text": "UPDATE v2_directives SET goal_json = json_set(goal_json, '$.owner', json_object('id', ?, 'name', ?)) WHERE ws_id = ? AND goal_json IS NOT NULL AND json_extract(goal_json, '$.owner.id') = ?",
        "slots": 0
      },
      "argument_expression_count": 4,
      "variadic_arguments_present": false
    },
    {
      "operation": "pseudonymise",
      "source_line": 158,
      "method": "run",
      "statement": {
        "text": "UPDATE v2_directives SET hold_json = json_set(hold_json, '$.by', ?) WHERE ws_id = ? AND hold_json IS NOT NULL AND json_extract(hold_json, '$.by') = ?",
        "slots": 0
      },
      "argument_expression_count": 3,
      "variadic_arguments_present": false
    },
    {
      "operation": "deleteOrphanDirectives",
      "source_line": 165,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_directives WHERE NOT EXISTS (SELECT 1 FROM v2_directive_targets t WHERE t.directive_id = v2_directives.id)",
        "slots": 0
      },
      "argument_expression_count": 0,
      "variadic_arguments_present": false
    },
    {
      "operation": "rollUpSession",
      "source_line": 172,
      "method": "get",
      "statement": {
        "text": "SELECT COUNT(*) AS n FROM v2_usage WHERE ws_id = ? AND session_key = ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "rollUpSession",
      "source_line": 173,
      "method": "run",
      "statement": {
        "text": "INSERT INTO v2_spend_rollups (ws_id, goal_id, day, model, basis, <slot-1>)\n     SELECT u.ws_id, COALESCE(e.goal_id, ''), substr(u.ts, 1, 10), u.model, u.basis,\n            COUNT(*), SUM(u.input), SUM(u.output), SUM(u.cache_read), SUM(u.cache_write_5m), SUM(u.cache_write_1h), SUM(u.cache_write_unsplit),\n            COALESCE(SUM(u.est_list_usd_micros), 0), SUM(CASE WHEN u.est_list_usd_micros IS NULL THEN 1 ELSE 0 END)\n     FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id\n     WHERE u.ws_id = ? AND u.session_key = ?\n     GROUP BY 1, 2, 3, 4, 5\n     ON CONFLICT (ws_id, goal_id, day, model, basis) DO UPDATE SET <slot-2>",
        "slots": 2
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "rollUpSession",
      "source_line": 185,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_sessions WHERE ws_id = ? AND session_key = ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "tableExists",
      "source_line": 189,
      "method": "get",
      "statement": {
        "text": "SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-1",
      "source_line": 218,
      "method": "all",
      "statement": {
        "text": "SELECT id FROM v2_workspaces WHERE deleted_at IS NOT NULL AND deleted_at <= ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-2",
      "source_line": 227,
      "method": "all",
      "statement": {
        "text": "SELECT id FROM v2_requests WHERE created_at < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-2",
      "source_line": 229,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_requests WHERE id = ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-2",
      "source_line": 230,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_directives WHERE kind = 'request' AND json_extract(request_json, '$.request_id') = ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-3",
      "source_line": 235,
      "method": "all",
      "statement": {
        "text": "SELECT s.ws_id, s.session_key FROM v2_sessions s\n       WHERE COALESCE(s.stopped_at, max(s.updated_at,\n               COALESCE((SELECT MAX(u.received_at) FROM v2_usage u WHERE u.ws_id = s.ws_id AND u.session_key = s.session_key), ''),\n               COALESCE((SELECT MAX(e.created_at) FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key), ''))) < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-4",
      "source_line": 251,
      "method": "all",
      "statement": {
        "text": "SELECT ws_id, user_id FROM v2_former_members WHERE user_id IS NOT NULL AND n IS NULL AND removed_at <= ? ORDER BY removed_at, rowid",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-4",
      "source_line": 255,
      "method": "get",
      "statement": {
        "text": "SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-5",
      "source_line": 264,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_audit WHERE at < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-6",
      "source_line": 270,
      "method": "run",
      "statement": {
        "text": "DELETE FROM ba_verification WHERE expiresAt < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-6",
      "source_line": 271,
      "method": "run",
      "statement": {
        "text": "DELETE FROM ba_session WHERE expiresAt < ? OR createdAt < ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-6",
      "source_line": 272,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_activity WHERE expires_at < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-6",
      "source_line": 273,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_invites WHERE accepted_at IS NULL AND expires_at < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-7",
      "source_line": 278,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_access_requests WHERE (status = 'pending' AND created_at < ?) OR (status <> 'pending' AND COALESCE(decided_at, created_at) < ?)",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-8",
      "source_line": 286,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_events WHERE at < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-9",
      "source_line": 292,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_ask_mentions WHERE ask_id IN (SELECT id FROM v2_asks WHERE <slot-1>)",
        "slots": 1
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-9",
      "source_line": 293,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_asks WHERE <slot-1>",
        "slots": 1
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-10",
      "source_line": 297,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_value_reports WHERE updated_at < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "STEPS.step-11",
      "source_line": 301,
      "method": "run",
      "statement": {
        "text": "DELETE FROM v2_deleted_sessions WHERE deleted_at < ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    }
  ],
  "public_types": [
    "export interface RetentionCounts {\n  workspaces_purged: number;\n  sessions_rolled_up: number;\n  usage_rows_rolled_up: number;\n  former_members_pseudonymised: number;\n  audit_rows_deleted: number;\n  codes_deleted: number;\n  sign_in_sessions_deleted: number;\n  activity_deleted: number;\n  invites_deleted: number;\n  access_requests_deleted: number;\n  events_deleted: number;\n  asks_deleted: number;\n  value_reports_deleted: number;\n  requests_deleted: number;\n  deleted_session_markers_deleted: number;\n}",
    "export type Tx = <T>(fn: () => T) => T | Promise<T>;"
  ],
  "text_protocol_tokens": [],
  "not_an_implementation": true,
  "contains_private_verification_inputs": false,
  "database_port_contract": {
    "run": {
      "parameters": [
        "sql string",
        "variadic SQL values"
      ],
      "returns": "numeric change count"
    },
    "get": {
      "parameters": [
        "sql string",
        "variadic SQL values"
      ],
      "returns": "one row or undefined"
    },
    "all": {
      "parameters": [
        "sql string",
        "variadic SQL values"
      ],
      "returns": "array of rows"
    },
    "timestamp_parameters": "UTC ISO strings, including external verification and session tables",
    "caller_owned_public_type": "Sql from core.mts, retained at the caller; no new runtime API export"
  },
  "query_bindings": [
    {
      "query_index": 1,
      "operation": "workspacesNaming",
      "source_line": 116,
      "parameters": [
        "userId"
      ]
    },
    {
      "query_index": 2,
      "operation": "noteDeparture",
      "source_line": 122,
      "parameters": [
        "wsId",
        "userId",
        "at"
      ]
    },
    {
      "query_index": 3,
      "operation": "cancelDeparture",
      "source_line": 127,
      "parameters": [
        "wsId",
        "userId"
      ]
    },
    {
      "query_index": 4,
      "operation": "pseudonymise",
      "source_line": 135,
      "parameters": [
        "wsId"
      ]
    },
    {
      "query_index": 5,
      "operation": "pseudonymise",
      "source_line": 136,
      "parameters": [
        "wsId",
        "userId"
      ]
    },
    {
      "query_index": 6,
      "operation": "pseudonymise",
      "source_line": 137,
      "parameters": [
        "allocated n",
        "at",
        "pending.id"
      ]
    },
    {
      "query_index": 7,
      "operation": "pseudonymise",
      "source_line": 138,
      "parameters": [
        "wsId",
        "allocated n",
        "at",
        "at"
      ]
    },
    {
      "query_index": 8,
      "operation": "pseudonymise",
      "source_line": 140,
      "parameters": [
        "userId"
      ]
    },
    {
      "query_index": 9,
      "operation": "pseudonymise",
      "source_line": 141,
      "parameters": [
        "wsId",
        "userId",
        "lowercased email or null",
        "same email or null"
      ]
    },
    {
      "query_index": 10,
      "operation": "pseudonymise",
      "source_line": 142,
      "parameters": [
        "wsId",
        "userId"
      ]
    },
    {
      "query_index": 11,
      "operation": "pseudonymise",
      "source_line": 143,
      "parameters": [
        "wsId",
        "eventActor(secret,userId)"
      ]
    },
    {
      "query_index": 12,
      "operation": "pseudonymise",
      "source_line": 144,
      "parameters": [
        "pseudonym",
        "wsId",
        "userId"
      ]
    },
    {
      "query_index": 13,
      "operation": "pseudonymise",
      "source_line": 145,
      "parameters": [
        "pseudonym",
        "wsId",
        "userId"
      ]
    },
    {
      "query_index": 14,
      "operation": "pseudonymise",
      "source_line": 148,
      "parameters": [
        "raw userId",
        "pseudonym",
        "wsId",
        "raw userId"
      ]
    },
    {
      "query_index": 15,
      "operation": "pseudonymise",
      "source_line": 150,
      "parameters": [
        "pseudonym",
        "personName(pseudonym,null)",
        "wsId",
        "userId"
      ]
    },
    {
      "query_index": 16,
      "operation": "pseudonymise",
      "source_line": 158,
      "parameters": [
        "pseudonym",
        "wsId",
        "userId"
      ]
    },
    {
      "query_index": 17,
      "operation": "deleteOrphanDirectives",
      "source_line": 165,
      "parameters": []
    },
    {
      "query_index": 18,
      "operation": "rollUpSession",
      "source_line": 172,
      "parameters": [
        "held session wsId",
        "held session key"
      ]
    },
    {
      "query_index": 19,
      "operation": "rollUpSession",
      "source_line": 173,
      "parameters": [
        "held session wsId",
        "held session key"
      ]
    },
    {
      "query_index": 20,
      "operation": "rollUpSession",
      "source_line": 185,
      "parameters": [
        "held session wsId",
        "held session key"
      ]
    },
    {
      "query_index": 21,
      "operation": "tableExists",
      "source_line": 189,
      "parameters": [
        "table name"
      ]
    },
    {
      "query_index": 22,
      "operation": "STEPS.step-1",
      "source_line": 218,
      "parameters": [
        "ISO now minus RESTORE_DAYS fixed days"
      ]
    },
    {
      "query_index": 23,
      "operation": "STEPS.step-2",
      "source_line": 227,
      "parameters": [
        "ISO now minus REQUEST_MONTHS UTC calendar months"
      ]
    },
    {
      "query_index": 24,
      "operation": "STEPS.step-2",
      "source_line": 229,
      "parameters": [
        "request row.id"
      ]
    },
    {
      "query_index": 25,
      "operation": "STEPS.step-2",
      "source_line": 230,
      "parameters": [
        "request row.id read again"
      ]
    },
    {
      "query_index": 26,
      "operation": "STEPS.step-3",
      "source_line": 235,
      "parameters": [
        "ISO now minus SESSION_MONTHS UTC calendar months"
      ]
    },
    {
      "query_index": 27,
      "operation": "STEPS.step-4",
      "source_line": 251,
      "parameters": [
        "ISO now minus FORMER_MEMBER_DAYS fixed days"
      ]
    },
    {
      "query_index": 28,
      "operation": "STEPS.step-4",
      "source_line": 255,
      "parameters": [
        "former row.ws_id",
        "former row.user_id"
      ]
    },
    {
      "query_index": 29,
      "operation": "STEPS.step-5",
      "source_line": 264,
      "parameters": [
        "ISO now minus AUDIT_MONTHS UTC calendar months"
      ]
    },
    {
      "query_index": 30,
      "operation": "STEPS.step-6",
      "source_line": 270,
      "parameters": [
        "held ISO now"
      ]
    },
    {
      "query_index": 31,
      "operation": "STEPS.step-6",
      "source_line": 271,
      "parameters": [
        "held ISO now",
        "ISO now minus sessionMaxDays(env) fixed days"
      ]
    },
    {
      "query_index": 32,
      "operation": "STEPS.step-6",
      "source_line": 272,
      "parameters": [
        "same held ISO now"
      ]
    },
    {
      "query_index": 33,
      "operation": "STEPS.step-6",
      "source_line": 273,
      "parameters": [
        "ISO now minus INVITE_GRACE_DAYS fixed days"
      ]
    },
    {
      "query_index": 34,
      "operation": "STEPS.step-7",
      "source_line": 278,
      "parameters": [
        "ISO now minus ACCESS_REQUEST_MONTHS UTC calendar months",
        "same held cutoff"
      ]
    },
    {
      "query_index": 35,
      "operation": "STEPS.step-8",
      "source_line": 286,
      "parameters": [
        "ISO now minus EVENT_MONTHS UTC calendar months"
      ]
    },
    {
      "query_index": 36,
      "operation": "STEPS.step-9",
      "source_line": 292,
      "parameters": [
        "ISO now minus CLOSED_ASK_MONTHS UTC calendar months"
      ]
    },
    {
      "query_index": 37,
      "operation": "STEPS.step-9",
      "source_line": 293,
      "parameters": [
        "same held closed-ask cutoff"
      ]
    },
    {
      "query_index": 38,
      "operation": "STEPS.step-10",
      "source_line": 297,
      "parameters": [
        "ISO now minus VALUE_REPORT_MONTHS UTC calendar months"
      ]
    },
    {
      "query_index": 39,
      "operation": "STEPS.step-11",
      "source_line": 301,
      "parameters": [
        "ISO now minus DELETED_SESSION_MONTHS UTC calendar months"
      ]
    }
  ]
}
```


#### Scenario: Preserve public values, refusals and supplied-port effects

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve all declared resources, exact public names and metadata, ordered constant values, source-only SQL and text data, default evaluation, repeated field reads, error identity and caller-owned effects. Introduce no ambient effects or public endpoint.
