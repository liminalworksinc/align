# Node-Server-Value implementation Flavor

## ADDED Requirements

### Requirement: Node value-card and report binding [authored:node-server-value-v3]

# Value-card Node binding

Use Node24 or later on macOS and Linux. Export the synchronous arity-one factory
create_value(resources) at server_value/create_value in the dependency-free
CommonJS package server_value. Return exactly valueView, VALUE_ACTIONS and
recordValue in that order. valueView is synchronous with length3. recordValue is
async with length4. The exact public positional signatures are valueView(pp, goalId, requestId) and recordValue(pp, goalId, requestId, b): principal first, goal identifier second, request identifier third, and body fourth for recordValue. Both obtain the approved request through getChangeRequest(pp, requestId, goalId), whose two identifier arguments have the opposite order from these public entrypoints. Preserve each interface's stated order. VALUE_ACTIONS is an ordinary live per-service array containing
viewed,reported,follow_up in that order. Preserve public function names.

The native runtime package server_value contains exactly two regular, non-symlink files: create_value.js and package.json. Its directory must not be a symlink. The manifest has name server_value, type commonjs and exactly the exports map {"./create_value":"./create_value.js"}. Do not include declarations, source maps, tests or other files inside that runtime package. Keep the original three public TypeScript types and six runtime re-exports at the caller boundary. Root build and test adapters may be outside the package.

Capture these 26 resources exactly once in order, without enumeration or eager
service calls: appsSentGoalVersion, ESTIMATES, diffOf, getChangeRequest, all, get,
run, tx, badRequest, conflict, event, goalObj, goalRow, parentIds, newId, nowIso,
take, canReadGoal, oneOf, memberName, cleanValueText, followUpUrl, spanWords,
VALUE_EDIT_DAYS, VALUE_NOTE_MAX, readDate. Call supplied functions with undefined
receivers. Compute the edit duration once from VALUE_EDIT_DAYS times24 times3600
times1000 during construction. Construction performs no clock lookup.

The caller retains the original Estimate, ValueReport and ValueView types and
the exact six runtime re-exports ESTIMATES, followUpUrl, loiUrlOk, spanWords,
VALUE_EDIT_DAYS and VALUE_NOTE_MAX. ESTIMATE_WORDS only participates in the
caller's compile-time choice equality assertion. It is no runtime resource.

The following ordered operations refer to exact SQL programs in the binding
contract. Caller records and query rows may have getters. Retain repeated reads,
short circuits, references and first failure. Stable standard intrinsics are
assumed; query JSON is parsed only where explicitly specified.

Approval and report projection:

- Obtain the approved request by calling getChangeRequest(pp,requestId,goalId), in that argument order. Read state and compare strictly to approved. If unequal, or the next approved_by read is falsy, or the next decided_at read is falsy, throw conflict('not_approved',"This change request isn't approved, so it has no value card."). Preserve those short circuits and return the exact request reference otherwise.
- A report projection returns a new record in key/read order id from row.id; person with id from row.person_id followed by name from memberName(a new row.person_id read); estimate; note; created_at; updated_at; can_edit. For can_edit read row.person_id, then pp.userId. Only when strictly equal, subtract the result of the original live Date.parse(row.created_at) lookup/call from the supplied now, and compare strictly less than the precomputed edit duration. Keep the Date.parse receiver described below. Do not cache a report projection between my_report and reports.
- Report rows use Q01 with workspace id then request id, preserving its created_at,id ordering and exact row references.

valueView:

- First obtain the approved request. Then call goalRow(pp.wsId,cr.goal.id) and retain its exact result. A readable-goal projection calls goalRow with a fresh pp.wsId read and the supplied id. A truthy row followed by truthy canReadGoal(pp,goalObj(row)) becomes a fresh id,title record, otherwise null.
- Obtain parent ids from parentIds(pp.wsId,g.id), map the readable projection in order and retain truthy projections. Obtain dependent ids from Q02 with pp.wsId,g.id, mapping id in query order, followed by Q03 with fresh pp.wsId,g.id reads, again mapping id. Build one Set from both lists, delete a fresh g.id read, sort a copied list with ordinary default sort, map readable projections and retain truthy results. Preserve the distinct query order and first id occurrence before the sort.
- A truthy first g.pod_id read causes Q04 with pp.wsId and a second g.pod_id read; coalesce its result to null. Otherwise team is null. Keep the exact query-row reference for a present team.
- Determine launched using cr.launch strictly equal to launched followed, only for true, by cr.version strictly unequal to null. For launched call Q05 with pp.wsId,g.id,cr.version, in that order; otherwise the directive is undefined. Keep this test separate from the output launch fallback described below.
- Start delivery and firstApplied as null. For a truthy directive, build delivery in order sessions,received,applied by calling Q06,Q07,Q08, each using a separate directive.id read. Coalesce each optional n to zero. Then call Q09 with another directive.id read and coalesce its optional at to null. The applied/enforced state filters and recorded_at server time are exact query contracts.
- Obtain decided by live Date.parse(cr.decided_at). For truthy firstApplied, parse it through a fresh live Date lookup, subtract decided, clamp at zero with Math.max and call spanWords; otherwise toApplied is null. Set launchedAt to a new cr.launch_decided_at read when launched, otherwise null. For a truthy launchedAt, parse it through another live Date lookup, subtract decided, clamp at zero and call spanWords; otherwise toLaunch is null.
- Obtain now through a new live Date.now lookup/call. Build participants as a fresh Set from cr.requester.id,cr.approved_by.id,then cr.approvers.map of each id,then cr.revisions.map of each author.id. For seesAll, first compare pp.wsRole to owner; only when false call participants.has(pp.userId). Obtain rows through reportRows(pp.wsId,cr.id), then find the first row whose person_id equals a fresh pp.userId read per comparison.
- Return keys in this exact order: change_request_id from cr.id; goal containing g.id,g.title,version from a new cr.version read only when launched otherwise null,base_version from cr.base_version,and the exact team; launch from cr.launch coalesced to launched; launched_at from launchedAt; diff from diffOf(pp,cr.id)?.diff coalesced to a fresh empty object; approved_by as the exact cr.approved_by reference; decided_at; created_at; approved_without_evidence; affected with parents then dependents; delivery; apps; measured; my_report; reports; sees_all_reports; follow_up_url.
- apps is null before launched. When launched, return a new record with everyone from pp.wsRole strictly equal to owner, then items from appsSentGoalVersion(pp,g.id,cr.version), preserving that service's exact result reference. measured contains proposal_to_decision from spanWords(Math.max(0,decided minus a fresh live Date.parse(cr.created_at) result)), then decision_to_launch from toLaunch and decision_to_first_applied from toApplied.
- my_report is null for a missing mine or a fresh report projection using now. reports maps every original row when seesAll; otherwise first filters rows by person_id strictly equal to a fresh pp.userId read per comparison, then maps fresh report projections with that same now. These projections repeat names, fields and date lookups even for a row already projected as my_report. The final field calls followUpUrl with no arguments. The function records no event.

recordValue:

- Obtain the approved request before inspecting the body. Call oneOf(b,'action',the exact live VALUE_ACTIONS array). Start estimate and note as null. Only for action reported call oneOf(b,'estimate',the exact supplied ESTIMATES reference). Validate note with the original repeated checks: read b.note against undefined; if unequal read it against null; if unequal inspect a third b.note read with typeof and refuse a nonstring via badRequest('note must be text'). Then perform a fresh typeof b.note check; for string call cleanValueText with another b.note read, otherwise use the empty string. If the cleaned length exceeds VALUE_NOTE_MAX throw badRequest with `note: at most N characters`, using the captured maximum. Convert a falsy cleaned note to null.
- Call take with key value: followed by pp.userId, limit30 and window60000. After that call, capture ws from pp.wsId then user from pp.userId. For viewed, await tx with a synchronous callback returning event('value_card_viewed',{ws,user}), and return recorded as its exact result followed by report null. For follow_up use the same protocol with follow_up_clicked. These paths do not obtain nowIso or query report rows.
- For the remaining reported path obtain at through nowIso before starting tx. Inside a synchronous callback call Q10 with ws,cr.id,user. For a truthy previous report, first perform a live Date.parse(at), then another live Date.parse(prev.created_at); when their difference is greater than or equal to the precomputed edit duration throw conflict('edit_closed',`A value report can be changed for N days after it was saved.`), using captured VALUE_EDIT_DAYS. Otherwise call Q11 with estimate,note,at,prev.id.
- For no previous report call Q12 with newId('vr'),ws,cr.id,user,estimate,note,at,at, preserving argument evaluation. After either write, return event('value_reported',{ws,user,props:{estimate}}) from the callback. Preserve the event return value rather than coercing it. No request id, goal id or note enters its properties. A callback failure is left to the caller's transaction rollback; add no retry or recovery.
- After commit call Q13 with ws,a new cr.id read,user. Return a new recorded,report record. Evaluate recorded first, then report by projecting the exact fetched row with pp and a fresh live Date.now lookup/call. Preserve the original missing-row behavior and every native or supplied failure.

Live Date protocol:

- Every original Date.parse or Date.now expression calls readDate once at that point, obtains the named method and calls it with the returned constructor as its receiver. Argument expressions are evaluated after that method lookup. Keep distinct lookups for each parse and for now; preserve caller-provided method results and failures. There is no ambient Date access, construction-time lookup or cached Date constructor.

No ambient IO, network, environment, clock, randomness, original implementation,
hidden result cache or transaction implementation belongs in the runtime export.
All effects flow through these resources. Exact SQL literals are appended by the
binding preparation. Complete consuming integration and current acceptance remain required.

## Exact SQL interfaces

### Q01 all with 2 bindings

```sql
SELECT id, person_id, estimate, note, created_at, updated_at FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? ORDER BY created_at, id
```

### Q02 all with 2 bindings

```sql
SELECT g.id FROM v2_goals g, json_each(g.depends_on_json) d WHERE g.ws_id = ? AND d.value = ?
```

### Q03 all with 2 bindings

```sql
SELECT DISTINCT source_goal_id AS id FROM v2_alignments WHERE ws_id = ? AND target_goal_id = ? AND state = 'approved' AND source_goal_id IS NOT NULL
```

### Q04 get with 2 bindings

```sql
SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?
```

### Q05 get with 3 bindings

```sql
SELECT id FROM v2_directives WHERE ws_id = ? AND goal_id = ? AND kind = 'goal_version' AND json_extract(goal_json, '$.version') = ? ORDER BY seq LIMIT 1
```

### Q06 get with 1 bindings

```sql
SELECT COUNT(*) AS n FROM v2_directive_targets WHERE directive_id = ?
```

### Q07 get with 1 bindings

```sql
SELECT COUNT(DISTINCT session_key) AS n FROM v2_receipts WHERE directive_id = ?
```

### Q08 get with 1 bindings

```sql
SELECT COUNT(DISTINCT session_key) AS n FROM v2_receipts WHERE directive_id = ? AND state IN ('applied','enforced')
```

### Q09 get with 1 bindings

```sql
SELECT MIN(recorded_at) AS at FROM v2_receipts WHERE directive_id = ? AND state IN ('applied','enforced')
```

### Q10 get with 3 bindings

```sql
SELECT * FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? AND person_id = ?
```

### Q11 run with 4 bindings

```sql
UPDATE v2_value_reports SET estimate = ?, note = ?, updated_at = ? WHERE id = ?
```

### Q12 run with 8 bindings

```sql
INSERT INTO v2_value_reports (id, ws_id, change_request_id, person_id, estimate, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

### Q13 get with 3 bindings

```sql
SELECT id, person_id, estimate, note, created_at, updated_at FROM v2_value_reports WHERE ws_id = ? AND change_request_id = ? AND person_id = ?
```


#### Scenario: Approved-request value projection, report privacy and transactional recording

- **WHEN** the Node value-card target is selected
- **THEN** Capture twenty-six resources once. Preserve the three owned public values, synchronous and asynchronous kinds, exact SQL and property/service order, approved-request and report privacy, safe delegated links and app visibility, nine live Date lookup sites, strict edit boundary, transaction and content-free event semantics, references and failures. Keep six caller re-export identities.
