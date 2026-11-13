# Node-Server-Change-Read implementation Flavor

## ADDED Requirements

### Requirement: Node change request record binding [authored:node-server-change-read-v1]

# Change request record Node binding

Use Node24 or later on macOS and Linux. Export synchronous arity-one
create_records(resources) at server_change_read/create_records in the
dependency-free CommonJS package server_change_read. Capture get,V2Error,
requestView,requestViews once in that order, without enumeration or eager calls.
Call supplied functions bare. V2Error remains the exact supplied constructor for
instanceof checks; capture and other failures retain their identities.

The runtime package directory server_change_read contains exactly two regular, non-symlink files: create_records.js and package.json. The directory itself must not be a symlink. The manifest has name server_change_read, type commonjs and exactly the export map {"./create_records":"./create_records.js"}. Keep all six original TypeScript public types at the caller. No declaration, source map or test belongs inside this runtime package; root build and test adapters may live outside it.

Return exactly CHANGE_REQUEST_STATES,listChangeRequests,getChangeRequest in that
order. The states are an ordinary live per-service array of pending,countered,
approved,rejected,withdrawn,superseded. The public functions are synchronous:
listChangeRequests(pp,state,limit=100), length2, and getChangeRequest(pp,id),
length2. Preserve names and default evaluation. The caller retains all six types:
ChangeRequestState,EvidenceLink,Condition,ChangeRequestSummary,ChangeDiff and
ChangeRequestDetail, and its compile-time equality assertion with stored states.

The only SQL program, Q01, is a get with no bindings:

```sql
SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'v2_change_requests'
```

Table check and public calls:

- Each public call first invokes get(Q01) once, converts its result through ordinary truthiness and adds no other table query. A falsy result returns a fresh empty array for listChangeRequests or null for getChangeRequest. No upstream view service runs then.
- For a present table listChangeRequests calls requestViews(pp,{state}), supplying a fresh one-key state object without local state validation. Call slice on that exact returned array with start0 and end Math.max(0,limit), then map the summary operation in order. Use native numeric and slice conversion for fractional, negative, infinite and NaN number limits. Do not sort, prefilter, clamp to a separate upper bound or catch its errors.
- For a present table getChangeRequest enters a try block that calls requestView(pp,id), then applies detail to its exact returned view. The catch evaluates error instanceof the captured V2Error first. Only for true read error.status and compare strictly to404; for equality return null. Rethrow the exact error otherwise. The projection stays inside this same catch scope. Errors from the initial table check remain outside it.

Summary operation:

- Return a fresh record with keys and evaluations in this order: id from v.id; goal containing id from v.goal.id then title from a fresh v.goal.title lookup; state; launch; condition as its exact supplied reference; requested_by from the exact v.requester reference; base_version; revision; reason; evidence; snapshot; created_at; updated_at.
- For evidence read v.revisions, flatMap each revision's evidence in upstream order, then map each link to a fresh record in this order: id,revision,kind,url,label,source,reported_as,added_by,added_at. Retain every field read and the exact added_by reference. Do not omit older revisions, relabel reported_as or reuse an input link object.
- For snapshot perform a new v.revisions lookup and find the first revision whose revision field strictly equals a fresh v.revision read for that comparison. Read its optional snapshot and coalesce null or undefined to null. Keep the exact snapshot reference. Do not cache the requested revision across comparisons or use a different matching rule.

Detail operation:

- First determine decided by reading v.state and comparing to approved. On false, read v.state again and compare to rejected. On false again, read v.state a third time and compare to superseded; only for true read v.approved_by and convert it to boolean. Keep all short circuits.
- Start a fresh empty diff object. Read v.diff once and destructure before then after from that supplied record. Process title,measures,depends_on,status,limits in that order. For each field inspect after.FIELD strictly against undefined. If present, read before.FIELD and then after.FIELD again into a fresh before,after record. For depends_on append hidden from a new v.diff.hidden_depends_on lookup. For limits coalesce before.limits to a fresh empty array only when null or undefined. Keep original before/after arrays and objects as references and keep absent fields absent.
- After building that diff, compute summary(v) and spread its current enumerable keys into a new return record. Then add decided_by,decision_note,diff,resulting_version,launch_decided_by,launch_decided_at,approved_without_evidence,decided_at, in that order.
- decided_by is null when decided is false; otherwise read v.approved_by and only when null or undefined read v.rejected_by. decision_note is a new v.decision_note read only when decided, otherwise null. diff is the newly built diff object.
- resulting_version first reads v.state and compares to approved. Only for true read v.launch and compare to launched. Only for true again read v.version; otherwise return null. This rule remains distinct from the earlier decided flag.
- launch_decided_by,launch_decided_at and approved_without_evidence use fresh direct v field reads. decided_at reads v.decided_at only when decided, otherwise null. Preserve upstream reference identities and all getter or supplied failures.

The runtime export has no ambient IO, network, configuration, clock, randomness,
original implementation import, hidden cache, permission substitute or recovery
path. Preserve native parsing and standard array behavior without adding guards.
Qualification, admission and source transfer require separate acceptance.


#### Scenario: Read summaries and decision records through existing permission-filtered request services

- **WHEN** the Node request-record target is selected
- **THEN** Capture four resources once. Preserve three runtime exports and six caller types, states, function arities and defaults, exact schema-table check, delegated visibility and state filtering, native slice limits, evidence and snapshot references, diff projections, decision and launch distinctions, repeated reads and the precise supplied-class 404 catch scope.
