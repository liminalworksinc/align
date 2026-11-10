# Node-Server-Metrics implementation Flavor

## ADDED Requirements

### Requirement: Operator Metrics target binding [authored:node-server-metrics-v4]

# JavaScript operator metrics binding

Provide the portable library package `server_metrics`, CommonJS, with precisely
`package.json` and `create_metrics.js`. The package name is `server_metrics`, type is
`commonjs`, and exports is exactly `{"./create_metrics":"./create_metrics.js"}`.
The module has one public own export: synchronous named function `create_metrics`,
length 1. It accepts one caller-owned resource object and returns the public API.
No runtime imports, ambient I/O, environment access, global state, random numbers,
actual timers or implicit host clock are permitted inside the library. The caller
owns the database, transactions and event implementation.

## Resources and observable calls

Capture the supplied fields once, in this order: `ESTIMATES`, `NOTE_REF_RE`,
`recordEvent`, `readDate`. Do not enumerate the resource object. Retain their exact
references. Calls to supplied standalone functions use an undefined receiver;
`db.get`, `db.all` and `db.run` use the supplied database as receiver. Preserve
supplied failure identity, call order and arguments; do not catch or translate an
unhandled error. Do not pre-read input fields or evaluate default expressions early.
Every use of a date constructor or static date method obtains that Date constructor
through `readDate()`, at the corresponding point of use.

`recordEvent` is the existing event recorder. `NOTE_REF_RE` is the supplied regular
expression used for a note reference. `ESTIMATES` supplies report estimate ordering.
These resources are not reimplemented. The accompanying public target-data record
defines the public constant values, ordered funnel entries and SQL templates. SQL,
predicate placement, parameter order and row iteration are part of the target port
contract because database call effects and failures are observable.

## Host toolchain and caller types

Use the Node host selected and probed by the JavaScript Flavor. This package
adds no third-party source dependency or new Node source-package range. Preserve
the normal toolchain, lock and SBOM checks. The TypeScript declarations in the
public data record remain caller-owned interface contracts; generate no extra
declaration file in this exact two-file JavaScript package.

## API

Return own enumerable exports in this exact order:
`weekStart`, `percentile`, `LOI_EVENTS`, `recordLoi`, `FUNNEL`, `WAW_WEEKS`,
`buildReport`, `formatReport`. Functions have these exact names and lengths: 1, 2,
4, 1 and 1 respectively for `weekStart`, `percentile`, `recordLoi`, `buildReport`
and `formatReport`. They are synchronous ordinary functions. Arrays and records
are stable for that API instance and retain their existing unfrozen runtime form.

- `weekStart(t)` returns Monday 00:00 UTC for the supplied numeric timestamp using
  calendar UTC fields. Invalid dates preserve the existing result or exception.
- `percentile(values,p)` returns null when empty. Otherwise it sorts a copy
  numerically and selects index `max(0,ceil(p*length)-1)`. It does not mutate input
  or clamp an out-of-range upper index into a valid observation.
- `recordLoi(db,name,wsId,options,now=Date.now())` evaluates its clock default before
  body checks. Refuse signed recording without `options.verifiedOriginal`, then a
  non-null note failing the supplied grammar, then a missing workspace, then an
  existing event of that name/workspace. Refusals are `{ok:false,reason}` with
  `verified_original_required`, `bad_note_ref`, `no_workspace`, or
  `already_recorded` in that order. The duplicate result includes the original
  `at`. Success formats the supplied time, creates a fresh props object, adds a
  truthy `note_ref` and, for a signed record, `verified_original:"yes"`, then calls
  `recordEvent(db,name,{ws:wsId,props,at})` and returns `{ok:true,at}`. No private
  store transaction is introduced.
- `buildReport(db,{since=null,now=new Date()}={})` reads only and returns the
  complete existing `Report`. `since` is a UTC date string or null. It is the
  lower bound for period events; workspace first-event facts are read without
  truncating their histories. Keep the supplied option access order and defaults.
- `formatReport(report)` returns the exact existing plain-text grammar without a
  final newline. It reads the supplied report, not a cached report or the database.

## Report fields and populations

Top-level property order is `generated_at`, `since`, `access`, `funnel`, `other`,
`time_to_first_value`, `weekly_active_workspaces`, `retention`, `goal_binding`,
`lois`, `value`. Preserve all nested schema names and property order from the
public TypeScript interface. Do not add a new report section.

Access fields in order: requested, requested_try, requested_evaluate, approved,
declined, codes_created, codes_from_requests, codes_redeemed. Count period events;
interest distinguishes try/evaluate and source distinguishes request-created codes.

The funnel uses the eight ordered public entries. A stage is reached if any named
event exists for that workspace. Its rows contain `step`, `workspaces`,
`of_previous`, `of_created`. Both fractions are null for the first stage; subsequent
fractions use the preceding count and creation-cohort count, rounded to four decimal
places, with null for a nonpositive denominator. First-value timings use each
workspace's first matching start and first bound-session event, clamp negative
durations to zero, then nearest-rank p50/p75 rounded to one decimal minute.

Emit eight weekly-active rows oldest first, including the current week. Activity
has four sources: session creation, epoch creation, usage received time, and audit
time with non-null workspace and actor. Deduplicate workspace/week and exclude
samples. Previous-week growth is null without a positive preceding count, otherwise
four-decimal relative growth. `complete` is true when that week's end is at or before
`now`. Without `since`, cohort history begins eleven weeks before the current week;
with it, use the week containing its UTC date. Include the earlier of that start and
eight weeks before the current week when reading activity. Cohort rows are ordered
by creation week, with week1/week4 counts and fractions null until the full target
week has ended.

Goal binding counts all period sessions and those having an epoch with a goal;
usage joins its exact workspace/session/epoch identity. Add retained rollups by day.
Null sums are zero. Rollup `goal_id` equal to the empty string is unbound. Emit
sessions, bound_sessions, sessions_share, requests, bound_requests, requests_share,
est_list_usd_micros, bound_est_list_usd_micros, spend_share in that order.

Letter records are ordered by event time; preserve per-workspace insertion order
and the existing last assignment if repeated input rows occur. Counts are period
event counts. Workspace-scoped value sections exclude sample workspaces, preserve
`ESTIMATES` order, count viewed person/workspace rows and distinct viewed workspaces,
and sum reported categories. Follow-up, first-ask and first-limit are workspace
event counts. The two access_from_value_card fields are global Q3 counts of
access_requested, filtered only by the period, via=value_card and their interest.
They include events with a null workspace ID and have no sample exclusion. Do not
use Q12 or its workspace-event helper for these two fields. Missing estimates
still have a zero entry. Approved-request workspace count is distinct and uses
its decision time.

## Public SQL target-data slots

The selected data record is `server-metrics.public-target-data-v4.json`. Its SQL
indices follow source order. Preserve every literal whitespace character,
including trailing spaces when an optional predicate is empty. The count of
argument expressions is an inventory of source expressions, not a fixed runtime
arity when a spread list is present.

- Query 3: slot 1 is the additional predicate or the empty string. Parameters are
  event name, the `since` lower bound or empty string, then the predicate's values.
  Interest, source, via and estimate predicates retain the exact JSON property
  paths and spaces stated by their query. Access interest predicates are
  `AND json_extract(props, '$.interest') = ?`; code source uses `$.source` instead.
  Value-card access combines `AND json_extract(props, '$.via') = ? AND
  json_extract(props, '$.interest') = ?` on one line with one space after AND.
- Query 12: slot 1 is `AND ws_id NOT IN (<marks>)` for nonempty sample workspace
  IDs, where marks are question marks joined by comma without spaces; otherwise
  it is empty. Slot 2 is an additional predicate or empty. Parameters are event
  name, period lower bound, sample IDs in insertion order, then extra values.
  Estimate selection uses `AND json_extract(props, '$.estimate') = ?`.
- Query 13 uses the same sample predicate and parameters beginning with the
  period lower bound, then sample IDs. Do not apply it to global binding queries.

SQL templates with no slots are used verbatim. Query 7's bound time is the ISO
activity lower bound; the session and usage period queries bind the period lower
bound. LOI workspace lookup binds wsId and duplicate lookup binds name, wsId.

## Observable access and effect order

Caller rows and options can have observable getters. Repeated reads, short
circuiting and supplied errors are part of this target protocol. Do not replace
them with early snapshots, cache a field or move a query across a refused branch.
Read options in normal parameter-destructuring order. The Date default for a
letter is evaluated before looking at its options. Its signed-event test reads
verifiedOriginal only for that event. A non-null note-reference test first reads
noteRef for null comparison and reads it again for the regex call. After workspace
and duplicate lookups, a truthy noteRef is tested again and read again for the
recorded property. The signed property follows the note property. The final event
argument's own field order is ws, props, at.

`weekStart` obtains one Date constructor for its local date, reads getUTCDay,
then obtains the Date provider again for UTC, evaluating getUTCFullYear,
getUTCMonth and getUTCDate in that order. The day formatter obtains a Date
constructor at each call. Percentile checks the supplied length before copying
and sorting; preserve the original array and the native out-of-range result.

Within buildReport use this observable sequence:

1. Resolve options, read now.getTime, then execute Q4 and map ws_id into the sample
   set. Execute Q5 and build the first-event map. For a new workspace row, read
   ws_id for the has test, again for insertion, then again for lookup; on an
   existing row omit only the insertion read. Read name then at for its event.
2. Execute eight Q3 access counts in the exact access-field order. Each count
   consumes its returned optional n immediately. Execute Q6 and filter each row
   by ws_id against the sample set. Build the funnel in constant entry order.
   For each stage, read each cohort row ws_id exactly once before checking that stage's event names, then hold that ID during all of its some-membership checks. Even a stage with two event names reads the row ID only once. Read it again for each subsequent stage. Preserve cohort row order within each stage; do not move the row lookup inside the some callback. First-value timing is defined here but is evaluated later while constructing
   the final report.
3. Compute the current week, then the cohort start. A truthy since value is
   parsed by the supplied Date.parse using its explicit UTC date string, then passed through weekStart.
   Format the activity lower bound using a fresh supplied Date constructor,
   then execute Q7. Check each activity row's ws_id against samples before
   reading its day. A kept row's day is parsed, passed through weekStart and
   its ws_id read again when added to the active-week set.
4. Build the eight weekly rows and their date labels. For each creation-cohort
   row, read at to derive its week; reject an earlier week before reading ws_id
   for insertion. Build retention rows in sorted week order, computing week1
   then week4. Check target-week completion before querying that active set.
5. Execute Q8, Q9 and Q10 in order. Defer reading Q8's row fields until the
   final goal_binding object. Compute live/rolled requests, then bound_requests,
   then usd, then bound_usd, reading each live field before its rolled field.
6. Execute Q11 and group its rows in iteration order. Read ws_id for lookup;
   when absent read it for the new row's ws_id. Read name, assign its at to
   sent_at or signed_at, then read ws_id for map assignment.
7. Construct sample IDs in set insertion order. Fetch the viewed rows with Q12,
   then construct the estimate map in supplied ESTIMATES.map order, reading
   each returned row-array length. Execute Q13 for distinct approved workspaces
   before reading the viewed array for the value object's people and workspace
   totals. Compute reported people from the estimate map, then follow-up count,
   then the two global Q3 value-card access counts, try before evaluate, then
   Q12 first-ask and first-limit counts. Each value-card access count consumes
   the returned optional n immediately with nullish zero; it does not fetch
   workspace rows or use an array length.
8. Construct the final report in its declared top-level order. In other, execute
   the sample-created, invite-sent, invite-accepted and member-first-session
   counts in that order. Evaluate timings next, first from creation then from
   code redemption. For each cohort row, look up its start via ws_id, then its
   bound event via another ws_id read, even when start is absent. Only a truthy
   start and bound cause Date.parse(bound), then Date.parse(start). In
   goal_binding read Q8's n, then bound, then bound and n again for the ratio.
   The other binding sums were computed earlier. Finally execute the two LOI
   counts, sent then signed, before adding their workspace rows and value.

Every Date.parse, Date.UTC or Date constructor lookup above uses readDate()
separately. Preserve invalid-date and supplied-failure behavior. Internal
read-only calculations do not authorize additional database calls or content.

## Text protocol

Preserve every heading, label, row order and fixed sentence in the public text
protocol. Tables compute each column's maximum width from headings and stringified
cells, pad on the right and join columns with two spaces; trim each line's trailing
spaces. Sections are separated by one empty line. Percentages are rounded to one
decimal percentage point with a percent suffix; null is `-`. Use normal number
spelling, so an integral percentage has no forced `.0`. Growth gets an explicit
`+` for nonnegative values. Durations are rounded minutes below an hour, integer
hours plus rounded remaining minutes below 48 hours, and integer days plus rounded
remaining hours thereafter. Round the remaining units independently without
carrying a rounded 60 minutes into another hour or 24 hours into another day.
Spending is dollars to two decimals from microdollars.
Current weekly rows append `(so far)`. Empty retention uses `(none)`. Optional letter
rows follow the operator-recorded letter summary. No private content is queried to
improve display or fill an absent label.

At formatter entry read report.access, then report.goal_binding, then
report.time_to_first_value and hold those exact references. Evaluate the output
array left to right. Read generated_at and since for its first line, rereading
truthy since for inclusion. The access rows use their held reference; funnel,
weekly, retention, other, value and LOI sections read their report properties at
the corresponding section, preserving repeated access within row expressions.
Do not recursively clone or normalize the report before formatting it. Compute
table widths from the heading columns and all row cells before producing padded
lines; each cell uses normal String conversion. Missing or unusual caller values
retain native failures and conversions rather than receiving new validation.

## Complete text layout

The target-data text tokens preserve exact fixed sentences and headings. The
following declarative layout gives their columns and fields. Use section order
below and the original heading strings. Field references are evaluated left to
right for each row and repeated as written; do not cache nested report objects.
Only access, goal_binding and time_to_first_value have entry-time aliases a, g, t.
`pct`, `dur`, `share` and dollar formatting have the rules above.

1. Header: `Align report, <generated_at><truthy since suffix> (weeks start Monday
   00:00 UTC; sample workspaces left out)`. The suffix is `, since <since>` only
   when truthy. Add an empty line.
2. Access. Columns: step, count, detail. Rows:
   requested / a.requested / `<a.requested_try> try, <a.requested_evaluate> evaluate`;
   approved / a.approved / pct(share(a.approved,a.requested));
   declined / a.declined / pct(share(a.declined,a.requested));
   codes created / a.codes_created / `<a.codes_from_requests> from requests`;
   codes redeemed / a.codes_redeemed / pct(share(a.codes_redeemed,a.codes_created)).
3. Workspace funnel. Columns: step, workspaces, of previous, of created.
   Map each f to f.step, f.workspaces, pct(f.of_previous), pct(f.of_created).
4. Time to first value. Columns: from, workspaces, median, p75. Two rows,
   `from workspace created` and `from code redeemed`. For each use its repeated
   t.from_workspace_created or t.from_code_redeemed reads to obtain workspaces,
   median_minutes and p75_minutes, formatting the last two with dur.
5. Weekly active workspaces. Columns: week, active, week on week. Each w reads
   complete, then week; append ` (so far)` to an incomplete week's date. Then
   active. Growth reads once for its strict-null test; otherwise read it for its
   nonnegative sign and again for pct, producing `<sign><percentage>`.
6. Retention by creation week. If r.retention.length is truthy, read r.retention
   again for mapping. Columns: cohort, workspaces, week 1, week 4. Each c reads
   cohort, workspaces, week1 for its strict-null test, then if non-null week1
   again and week1_share to make `<count> (<pct>)`; repeat for week4 and
   week4_share. A null week prints `-`. If there are no rows, print `(none)`.
7. Bound to goals. Columns: empty heading, bound, total, share. Rows:
   sessions / g.bound_sessions / g.sessions / pct(g.sessions_share);
   requests / g.bound_requests / g.requests / pct(g.requests_share);
   estimated spend / dollars(g.bound_est_list_usd_micros) /
   dollars(g.est_list_usd_micros) / pct(g.spend_share).
8. Other. Columns: empty heading, count. Rows: sample workspaces created,
   invites sent, invites accepted, people with a first shared session in a
   workspace. Read each from its own r.other access, using
   sample_workspaces_created, invites_sent, invites_accepted and
   people_with_a_first_session respectively.
9. Decision value. Columns: empty heading, count, detail. Rows:
   workspaces with an approved request / r.value.workspaces_with_approved_request
   / empty; value card viewed / r.value.viewed.people / `1 workspace` if
   r.value.viewed.workspaces is exactly 1, otherwise reread that value for
   `<count> workspaces`; value reported / r.value.reported.people / supplied
   ESTIMATES.map order of `<r.value.reported.by_estimate[e]> <e>` joined by
   comma-space; follow-up clicked / r.value.follow_up_clicked / empty;
   access requested from the card / sum of separate r.value.access_from_value_card
   try and evaluate reads / reread both for `<try> try, <evaluate> evaluate`;
   workspaces with a first ask / r.value.first_ask / empty;
   workspaces with a first limit / r.value.first_limit / empty.
10. LOI summary: `LOIs (operator-recorded): <r.lois.sent> sent, <r.lois.signed>
    signed (verified originals only)` on one line. If r.lois.workspaces.length
    is truthy, reread that array for a table with columns workspace, sent, signed.
    Each l gives ws_id, then sent_at tested for truthiness and reread for its
    first ten characters when truthy or `-` otherwise, then the analogous signed_at
    rule. An empty list adds no table and no placeholder line.

Each section after the header starts with its exact heading and an empty line
precedes each new section. Return the final line array joined with newline. The
LOI table is the last optional output, so do not add a final empty line or newline.

## Exact event and returned-row bindings

The public target data's event_bindings record gives the literal stored event
names for every report count and timing start. A report field name or displayed
label does not rename the stored event. In particular, code events are
`code_created` and `code_redeemed`, first-session people use
`member_first_session_captured`, and follow-up uses `follow_up_clicked`.
Apply the same event names to the count predicates and timing first-event lookup.

Capture the period lower bound once as `since ?? ""` after destructuring options,
before now.getTime. This is nullish fallback, not truthiness fallback. Use that
bound for all period query arguments. The separate cohort-start branch tests
truthy since. It obtains readDate().parse for the string
`<since>T00:00:00Z`, then calls weekStart. Activity row day parsing similarly
obtains readDate().parse for `<row.day>T00:00:00Z`. Creation-cohort row at parsing
uses readDate().parse(row.at). These static parse calls do not construct Date
instances. ISO activity lower bounds and day labels still construct Dates.

For weekStart, construct its local Date, compute Monday offset from getUTCDay,
then obtain readDate().UTC and pass the date's unchanged UTC year, month and day.
Subtract offset times 86400000 from the returned UTC timestamp. Preserve that
evaluation order, including observable supplied methods and failures.

The first-event index is a Map of workspace IDs to Maps of event names to at
values. Reached-stage membership tests the nested Map's has, not the truthiness
of an event timestamp. In row order, has outer workspace, insert a new nested
Map only when absent, then get that workspace and set the row's name and at.
Retention creation cohorts keep ordered arrays of workspace IDs, including
duplicate creation rows. Their sizes and retained counts are array lengths;
activity remains a deduplicating Set per week.

Database single-row values may be null or undefined. Access counts use optional
n with nullish zero. Goal-binding sums independently use optional requests,
bound_requests, usd and bound_usd with nullish zero, reading the live value then
the rolled value for each sum in that order. Final sessions use optional n with
nullish zero, then optional bound with nullish zero, then reread optional bound
and n for the share. Preserve false, empty string or NaN rather than applying a
new truthiness default. LOI row creation uses nullish fallback for a missing
Map entry. Active-week counts use optional size with nullish zero.

Timing minutes divide the difference between Date.parse(bound) and
Date.parse(start) by 60000, then clamp the divided value to zero. Resolve the
supplied Date provider separately for each parse, bound before start. Timing
summaries retain nearest-rank calculation and one-decimal minute rounding.

## Formatter conversion order

For each table, calculate widths column by column. For each heading column,
visit every row and convert that row's cell with String to measure its length.
After all widths are computed, emit the heading by padding its string cells.
Then emit rows in row order, converting each row cell with String again before
padding. Caller conversions can have effects or throw. Preserve the two passes
and their column-first, then row-first order. Do not eagerly convert all cells
or keep converted strings between width calculation and row output.

## Public target data

The following complete data record is part of this target contract. SQL strings, constants, public type declarations, text tokens and event bindings are normative data, not a supplied implementation.

```json
{
  "schema": "align/public-node-port-data@1",
  "component": "server-metrics",
  "original_source": "lib/v2/metrics-core.mts",
  "original_source_sha256": "b1efbdd97422e28716e34719428d5e4f4efc86a7cdf67ae67b1fb06f87d4bd21",
  "constants": {
    "LOI_EVENTS": [
      "loi_sent",
      "loi_signed"
    ],
    "FUNNEL": [
      {
        "step": "workspace created",
        "events": [
          "workspace_created"
        ]
      },
      {
        "step": "device paired",
        "events": [
          "device_paired"
        ]
      },
      {
        "step": "first session captured",
        "events": [
          "first_session_captured"
        ]
      },
      {
        "step": "first session bound to a goal",
        "events": [
          "first_session_bound"
        ]
      },
      {
        "step": "second member joined",
        "events": [
          "second_member_joined"
        ]
      },
      {
        "step": "first change request",
        "events": [
          "first_change_request"
        ]
      },
      {
        "step": "first approval or directive",
        "events": [
          "first_approval",
          "first_directive"
        ]
      },
      {
        "step": "first MCP read",
        "events": [
          "first_mcp_read"
        ]
      }
    ],
    "WAW_WEEKS": 8
  },
  "sql": [
    {
      "operation": "recordLoi",
      "source_line": 58,
      "method": "get",
      "statement": {
        "text": "SELECT 1 AS x FROM v2_workspaces WHERE id = ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "recordLoi",
      "source_line": 59,
      "method": "get",
      "statement": {
        "text": "SELECT at FROM v2_events WHERE name = ? AND ws_id = ?",
        "slots": 0
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": false
    },
    {
      "operation": "count",
      "source_line": 133,
      "method": "get",
      "statement": {
        "text": "SELECT COUNT(*) AS n FROM v2_events WHERE name = ? AND at >= ? <slot-1>",
        "slots": 1
      },
      "argument_expression_count": 3,
      "variadic_arguments_present": true
    },
    {
      "operation": "buildReport",
      "source_line": 134,
      "method": "all",
      "statement": {
        "text": "SELECT ws_id FROM v2_events WHERE name = 'workspace_created' AND json_extract(props, '$.kind') = 'sample'",
        "slots": 0
      },
      "argument_expression_count": 0,
      "variadic_arguments_present": false
    },
    {
      "operation": "buildReport",
      "source_line": 138,
      "method": "all",
      "statement": {
        "text": "SELECT ws_id, name, MIN(at) AS at FROM v2_events WHERE ws_id IS NOT NULL GROUP BY ws_id, name",
        "slots": 0
      },
      "argument_expression_count": 0,
      "variadic_arguments_present": false
    },
    {
      "operation": "buildReport",
      "source_line": 157,
      "method": "all",
      "statement": {
        "text": "SELECT ws_id, at FROM v2_events WHERE name = 'workspace_created' AND ws_id IS NOT NULL AND at >= ? ORDER BY at",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "buildReport",
      "source_line": 179,
      "method": "all",
      "statement": {
        "text": "SELECT DISTINCT ws_id, substr(at, 1, 10) AS day FROM (\n       SELECT ws_id, created_at AS at FROM v2_sessions\n       UNION ALL SELECT ws_id, created_at FROM v2_epochs\n       UNION ALL SELECT ws_id, received_at FROM v2_usage\n       UNION ALL SELECT ws_id, at FROM v2_audit WHERE ws_id IS NOT NULL AND actor_id IS NOT NULL\n     ) WHERE at >= ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "buildReport",
      "source_line": 223,
      "method": "get",
      "statement": {
        "text": "SELECT COUNT(*) AS n, SUM(EXISTS (SELECT 1 FROM v2_epochs e WHERE e.ws_id = s.ws_id AND e.session_key = s.session_key AND e.goal_id IS NOT NULL)) AS bound\n     FROM v2_sessions s WHERE s.created_at >= ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "buildReport",
      "source_line": 228,
      "method": "get",
      "statement": {
        "text": "SELECT COUNT(*) AS requests, SUM(e.goal_id IS NOT NULL) AS bound_requests, SUM(u.est_list_usd_micros) AS usd,\n            SUM(CASE WHEN e.goal_id IS NOT NULL THEN u.est_list_usd_micros END) AS bound_usd\n     FROM v2_usage u LEFT JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id\n     WHERE u.ts >= ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "buildReport",
      "source_line": 235,
      "method": "get",
      "statement": {
        "text": "SELECT SUM(requests) AS requests, SUM(CASE WHEN goal_id <> '' THEN requests END) AS bound_requests,\n            SUM(est_list_usd_micros) AS usd, SUM(CASE WHEN goal_id <> '' THEN est_list_usd_micros END) AS bound_usd\n     FROM v2_spend_rollups WHERE day >= ?",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "buildReport",
      "source_line": 248,
      "method": "all",
      "statement": {
        "text": "SELECT ws_id, name, at FROM v2_events WHERE name IN ('loi_sent', 'loi_signed') AND at >= ? ORDER BY at",
        "slots": 0
      },
      "argument_expression_count": 1,
      "variadic_arguments_present": false
    },
    {
      "operation": "wsEvents",
      "source_line": 259,
      "method": "all",
      "statement": {
        "text": "SELECT ws_id FROM v2_events WHERE name = ? AND at >= ? AND ws_id IS NOT NULL <slot-1> <slot-2>",
        "slots": 2
      },
      "argument_expression_count": 4,
      "variadic_arguments_present": true
    },
    {
      "operation": "buildReport",
      "source_line": 264,
      "method": "get",
      "statement": {
        "text": "SELECT COUNT(DISTINCT ws_id) AS n FROM v2_change_requests WHERE state = 'approved' AND decided_at >= ? <slot-1>",
        "slots": 1
      },
      "argument_expression_count": 2,
      "variadic_arguments_present": true
    }
  ],
  "public_types": [
    "export type LoiEvent = (typeof LOI_EVENTS)[number];",
    "export type LoiResult = { ok: true; at: string } | { ok: false; reason: \"no_workspace\" | \"verified_original_required\" | \"bad_note_ref\" | \"already_recorded\"; at?: string };",
    "interface Timing {\n  workspaces: number;\n  median_minutes: number | null;\n  p75_minutes: number | null;\n}",
    "export interface Report {\n  generated_at: string;\n  since: string | null;\n  access: { requested: number; requested_try: number; requested_evaluate: number; approved: number; declined: number; codes_created: number; codes_from_requests: number; codes_redeemed: number };\n  funnel: { step: string; workspaces: number; of_previous: number | null; of_created: number | null }[];\n  other: { sample_workspaces_created: number; invites_sent: number; invites_accepted: number; people_with_a_first_session: number };\n  time_to_first_value: { from_workspace_created: Timing; from_code_redeemed: Timing };\n  weekly_active_workspaces: { week: string; active: number; growth: number | null; complete: boolean }[];\n  retention: { cohort: string; workspaces: number; week1: number | null; week1_share: number | null; week4: number | null; week4_share: number | null }[];\n  goal_binding: {\n    sessions: number;\n    bound_sessions: number;\n    sessions_share: number | null;\n    requests: number;\n    bound_requests: number;\n    requests_share: number | null;\n    est_list_usd_micros: number;\n    bound_est_list_usd_micros: number;\n    spend_share: number | null;\n  };\n  lois: { sent: number; signed: number; workspaces: { ws_id: string; sent_at: string | null; signed_at: string | null }[] };\n  value: {\n    workspaces_with_approved_request: number;\n    viewed: { people: number; workspaces: number };\n    reported: { people: number; by_estimate: Record<(typeof ESTIMATES)[number], number> };\n    follow_up_clicked: number;\n    access_from_value_card: { try: number; evaluate: number };\n    first_ask: number;\n    first_limit: number;\n  };\n}"
  ],
  "text_protocol_tokens": [
    {
      "source_line": 328,
      "text": "Align report, <slot-1><slot-2> (weeks start Monday 00:00 UTC; sample workspaces left out)",
      "slots": 2
    },
    {
      "source_line": 328,
      "text": ", since <slot-1>",
      "slots": 1
    },
    {
      "source_line": 328,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 329,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 330,
      "text": "Access",
      "slots": 0
    },
    {
      "source_line": 333,
      "text": "requested",
      "slots": 0
    },
    {
      "source_line": 333,
      "text": "<slot-1> try, <slot-2> evaluate",
      "slots": 2
    },
    {
      "source_line": 334,
      "text": "approved",
      "slots": 0
    },
    {
      "source_line": 335,
      "text": "declined",
      "slots": 0
    },
    {
      "source_line": 336,
      "text": "codes created",
      "slots": 0
    },
    {
      "source_line": 336,
      "text": "<slot-1> from requests",
      "slots": 1
    },
    {
      "source_line": 337,
      "text": "codes redeemed",
      "slots": 0
    },
    {
      "source_line": 339,
      "text": "step",
      "slots": 0
    },
    {
      "source_line": 339,
      "text": "count",
      "slots": 0
    },
    {
      "source_line": 339,
      "text": "detail",
      "slots": 0
    },
    {
      "source_line": 341,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 342,
      "text": "Workspace funnel (workspaces created in the period that reached each step)",
      "slots": 0
    },
    {
      "source_line": 345,
      "text": "step",
      "slots": 0
    },
    {
      "source_line": 345,
      "text": "workspaces",
      "slots": 0
    },
    {
      "source_line": 345,
      "text": "of previous",
      "slots": 0
    },
    {
      "source_line": 345,
      "text": "of created",
      "slots": 0
    },
    {
      "source_line": 347,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 348,
      "text": "Time to first value (to the first session bound to a goal)",
      "slots": 0
    },
    {
      "source_line": 351,
      "text": "from workspace created",
      "slots": 0
    },
    {
      "source_line": 352,
      "text": "from code redeemed",
      "slots": 0
    },
    {
      "source_line": 354,
      "text": "from",
      "slots": 0
    },
    {
      "source_line": 354,
      "text": "workspaces",
      "slots": 0
    },
    {
      "source_line": 354,
      "text": "median",
      "slots": 0
    },
    {
      "source_line": 354,
      "text": "p75",
      "slots": 0
    },
    {
      "source_line": 356,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 357,
      "text": "Weekly active workspaces (a shared session, epoch or usage upload, or a member's audited action, that week)",
      "slots": 0
    },
    {
      "source_line": 359,
      "text": "<slot-1> (so far)",
      "slots": 1
    },
    {
      "source_line": 359,
      "text": "-",
      "slots": 0
    },
    {
      "source_line": 359,
      "text": "<slot-1><slot-2>",
      "slots": 2
    },
    {
      "source_line": 359,
      "text": "+",
      "slots": 0
    },
    {
      "source_line": 359,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 360,
      "text": "week",
      "slots": 0
    },
    {
      "source_line": 360,
      "text": "active",
      "slots": 0
    },
    {
      "source_line": 360,
      "text": "week on week",
      "slots": 0
    },
    {
      "source_line": 362,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 363,
      "text": "Retention by creation week (active in week 1 and week 4 after it; - until that week ends)",
      "slots": 0
    },
    {
      "source_line": 366,
      "text": "-",
      "slots": 0
    },
    {
      "source_line": 366,
      "text": "<slot-1> (<slot-2>)",
      "slots": 2
    },
    {
      "source_line": 366,
      "text": "-",
      "slots": 0
    },
    {
      "source_line": 366,
      "text": "<slot-1> (<slot-2>)",
      "slots": 2
    },
    {
      "source_line": 367,
      "text": "cohort",
      "slots": 0
    },
    {
      "source_line": 367,
      "text": "workspaces",
      "slots": 0
    },
    {
      "source_line": 367,
      "text": "week 1",
      "slots": 0
    },
    {
      "source_line": 367,
      "text": "week 4",
      "slots": 0
    },
    {
      "source_line": 369,
      "text": "(none)",
      "slots": 0
    },
    {
      "source_line": 370,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 371,
      "text": "Bound to goals (sessions shared, and usage, in the period)",
      "slots": 0
    },
    {
      "source_line": 374,
      "text": "sessions",
      "slots": 0
    },
    {
      "source_line": 375,
      "text": "requests",
      "slots": 0
    },
    {
      "source_line": 376,
      "text": "estimated spend",
      "slots": 0
    },
    {
      "source_line": 378,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 378,
      "text": "bound",
      "slots": 0
    },
    {
      "source_line": 378,
      "text": "total",
      "slots": 0
    },
    {
      "source_line": 378,
      "text": "share",
      "slots": 0
    },
    {
      "source_line": 380,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 381,
      "text": "Other",
      "slots": 0
    },
    {
      "source_line": 384,
      "text": "sample workspaces created",
      "slots": 0
    },
    {
      "source_line": 385,
      "text": "invites sent",
      "slots": 0
    },
    {
      "source_line": 386,
      "text": "invites accepted",
      "slots": 0
    },
    {
      "source_line": 387,
      "text": "people with a first shared session in a workspace",
      "slots": 0
    },
    {
      "source_line": 389,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 389,
      "text": "count",
      "slots": 0
    },
    {
      "source_line": 391,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 392,
      "text": "Decision value (approved change requests and their value card; one per person per workspace)",
      "slots": 0
    },
    {
      "source_line": 395,
      "text": "workspaces with an approved request",
      "slots": 0
    },
    {
      "source_line": 395,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 396,
      "text": "value card viewed",
      "slots": 0
    },
    {
      "source_line": 396,
      "text": "1 workspace",
      "slots": 0
    },
    {
      "source_line": 396,
      "text": "<slot-1> workspaces",
      "slots": 1
    },
    {
      "source_line": 397,
      "text": "value reported",
      "slots": 0
    },
    {
      "source_line": 397,
      "text": "<slot-1> <slot-2>",
      "slots": 2
    },
    {
      "source_line": 397,
      "text": ", ",
      "slots": 0
    },
    {
      "source_line": 398,
      "text": "follow-up clicked",
      "slots": 0
    },
    {
      "source_line": 398,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 399,
      "text": "access requested from the card",
      "slots": 0
    },
    {
      "source_line": 399,
      "text": "<slot-1> try, <slot-2> evaluate",
      "slots": 2
    },
    {
      "source_line": 400,
      "text": "workspaces with a first ask",
      "slots": 0
    },
    {
      "source_line": 400,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 401,
      "text": "workspaces with a first limit",
      "slots": 0
    },
    {
      "source_line": 401,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 403,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 403,
      "text": "count",
      "slots": 0
    },
    {
      "source_line": 403,
      "text": "detail",
      "slots": 0
    },
    {
      "source_line": 405,
      "text": "",
      "slots": 0
    },
    {
      "source_line": 406,
      "text": "LOIs (operator-recorded): <slot-1> sent, <slot-2> signed (verified originals only)",
      "slots": 2
    },
    {
      "source_line": 409,
      "text": "-",
      "slots": 0
    },
    {
      "source_line": 409,
      "text": "-",
      "slots": 0
    },
    {
      "source_line": 410,
      "text": "workspace",
      "slots": 0
    },
    {
      "source_line": 410,
      "text": "sent",
      "slots": 0
    },
    {
      "source_line": 410,
      "text": "signed",
      "slots": 0
    },
    {
      "source_line": 414,
      "text": "\n",
      "slots": 0
    }
  ],
  "not_an_implementation": true,
  "contains_private_verification_inputs": false,
  "event_bindings": {
    "access": [
      {
        "field": "requested",
        "event": "access_requested",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "requested_try",
        "event": "access_requested",
        "predicate": "AND json_extract(props, '$.interest') = ?",
        "values": [
          "try"
        ],
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "requested_evaluate",
        "event": "access_requested",
        "predicate": "AND json_extract(props, '$.interest') = ?",
        "values": [
          "evaluate"
        ],
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "approved",
        "event": "access_approved",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "declined",
        "event": "access_declined",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "codes_created",
        "event": "code_created",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "codes_from_requests",
        "event": "code_created",
        "predicate": "AND json_extract(props, '$.source') = ?",
        "values": [
          "request"
        ],
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "codes_redeemed",
        "event": "code_redeemed",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      }
    ],
    "timing_start_events": {
      "from_workspace_created": "workspace_created",
      "from_code_redeemed": "code_redeemed"
    },
    "timing_end_event": "first_session_bound",
    "other": [
      {
        "field": "sample_workspaces_created",
        "event": "workspace_created",
        "predicate": "AND json_extract(props, '$.kind') = ?",
        "values": [
          "sample"
        ],
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "invites_sent",
        "event": "invite_sent",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "invites_accepted",
        "event": "invite_accepted",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "people_with_a_first_session",
        "event": "member_first_session_captured",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      }
    ],
    "value": [
      {
        "field": "viewed",
        "event": "value_card_viewed",
        "query_index": 12,
        "population": "non-null workspace IDs excluding sample IDs"
      },
      {
        "field": "reported.by_estimate",
        "event": "value_reported",
        "predicate": "AND json_extract(props, '$.estimate') = ?",
        "value_source": "each supplied ESTIMATES element",
        "query_index": 12,
        "population": "non-null workspace IDs excluding sample IDs"
      },
      {
        "field": "follow_up_clicked",
        "event": "follow_up_clicked",
        "query_index": 12,
        "population": "non-null workspace IDs excluding sample IDs"
      },
      {
        "field": "access_from_value_card.try",
        "event": "access_requested",
        "predicate": "AND json_extract(props, '$.via') = ? AND json_extract(props, '$.interest') = ?",
        "values": [
          "value_card",
          "try"
        ],
        "query_index": 3,
        "population": "global period events, including null workspace IDs; no sample exclusion",
        "result": "optional n with nullish zero"
      },
      {
        "field": "access_from_value_card.evaluate",
        "event": "access_requested",
        "predicate": "AND json_extract(props, '$.via') = ? AND json_extract(props, '$.interest') = ?",
        "values": [
          "value_card",
          "evaluate"
        ],
        "query_index": 3,
        "population": "global period events, including null workspace IDs; no sample exclusion",
        "result": "optional n with nullish zero"
      },
      {
        "field": "first_ask",
        "event": "first_ask",
        "query_index": 12,
        "population": "non-null workspace IDs excluding sample IDs"
      },
      {
        "field": "first_limit",
        "event": "first_limit",
        "query_index": 12,
        "population": "non-null workspace IDs excluding sample IDs"
      }
    ],
    "lois": [
      {
        "field": "sent",
        "event": "loi_sent",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      },
      {
        "field": "signed",
        "event": "loi_signed",
        "query_index": 3,
        "population": "global period events, including null workspace IDs"
      }
    ]
  }
}
```


#### Scenario: Preserve public values, refusals and supplied-port effects

- **WHEN** the portable JavaScript library target is selected
- **THEN** Preserve all declared resources, exact public names and metadata, ordered constant values, source-only SQL and text data, default evaluation, repeated field reads, error identity and caller-owned effects. Introduce no ambient effects or public endpoint.
