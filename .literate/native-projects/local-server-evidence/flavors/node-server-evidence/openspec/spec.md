# Node-Server-Evidence implementation Flavor

## ADDED Requirements

### Requirement: Node evidence and snapshot binding [authored:node-server-evidence-v1]

# Evidence Node binding

Use Node24 or later on macOS and Linux. Export synchronous arity-one
create_evidence(resources) at server_evidence/create_evidence in a dependency-free
CommonJS package server_evidence. Capture these eleven resources once in order:
all,get,badRequest,goalTargets,authorize,goalSpend,memberName,oneOf,str,readURL,readDate.
Do not enumerate resources or call services during construction. Invoke supplied
service functions with undefined receivers, except for the constructor and static
method protocols explicitly stated below. Preserve supplied failure identity.

The native package directory is regular and not a symlink. It contains exactly
two regular, non-symlink files, create_evidence.js and package.json. The manifest
has name server_evidence, type commonjs and exactly the export map
{"./create_evidence":"./create_evidence.js"}. No declarations, source maps, tests
or other files belong inside it. Root build and test adapters may be outside it.
The caller retains EvidenceKind,EvidenceSource,EvidenceRow,EvidenceView,SnapshotView.

Return exactly these values in order: EVIDENCE_KINDS,EVIDENCE_PER_REVISION,
evidenceInput,evidenceRows,evidenceCount,evidenceView,recordSnapshot,snapshotView.
All functions are synchronous. Their lengths are respectively1,1,2,2,3,3.
Preserve their names. EVIDENCE_KINDS is an ordinary live per-service array of
pr,ci_run,incident,dashboard,doc,other. EVIDENCE_PER_REVISION is10. Constants used
internally are URL maximum2048, label maximum120, snapshot days30 and one day
equal to24 times3600 times1000 milliseconds. Do not freeze the public array.

Input and evidence operations:

- evidenceInput(b) first calls oneOf(b,'kind',the exact live EVIDENCE_KINDS array), then str(b,'url',2048). Within a try block obtain the current constructor through readURL() and invoke it with new and that exact raw string. A lookup or constructor failure is replaced by badRequest('url must be an https URL'); no other validation belongs in that try block.
- Read the returned URL's protocol and compare strictly to https:. Only for equality read hostname and require truthiness. Refuse either failure through badRequest('url must be an https URL'). Next read username; only if falsy read password. A truthy credential field throws badRequest('url must not contain a user name or password'). Next read href and its length; a value above2048 throws badRequest('url is too long (max 2048 characters)'). Do not cache href for the return.
- Next call str(b,'label',120). Refuse a label containing any ASCII control U+0000 through U+001F or U+007F through badRequest('label must be one line of text'). Return a fresh record with kind, url from a fresh href read, then label, in that order. Do not fetch or verify the URL.
- evidenceRows(requestId) calls Q01 with requestId and returns the exact array reference. evidenceCount(requestId,revision) calls Q02 with those arguments in order and returns its optional n coalesced to zero only for null or undefined.
- evidenceView(e,canRemove) returns a fresh record in key/read order id,revision,kind,url,label,source,reported_as,added_by,added_at,can_remove. The first six fields read matching e fields. reported_as reads e.source again and becomes agent-reported only for strict agent, otherwise self-reported. added_by is a fresh id,name record: read e.added_by for id, then read it again as the argument to memberName. added_at reads e.added_at. can_remove is the exact supplied flag. Add no permission decision.

Snapshot operations:

- recordSnapshot(ws,goalId,at) retains at as the end time. Evaluate the constructor from one readDate() call before evaluating its argument. That argument obtains a second constructor through readDate(), looks up its parse method, calls parse with that second constructor as receiver and at as its argument, then subtracts30 times24 times3600 times1000. Invoke the first constructor with new and that result; invoke the constructed date's toISOString with its own receiver. Keep both live constructor lookups and their failure order. Do not substitute an ambient date or recover an invalid date.
- Build a fresh snapshot in this order: recorded_at from at; window with from,then to from at,then days30; spend from goalSpend(ws,goalId,from,to); bound_sessions from the length of the exact goalTargets(ws,goalId) result; last_activity_at. For the last field call Q03 with ws,goalId repeated three times in that order. Return its optional at coalesced to null only for null or undefined. After all services and field reads, return the ordinary JSON.stringify result for the complete snapshot. Preserve native serialization and errors, with no retry or added transaction.
- snapshotView(pp,json,revision) returns null immediately for any falsy json and performs no parse or permission check on that path. Otherwise first call ordinary JSON.parse with json, then call authorize(pp,'spend.read',{kind:'workspace'}) using a fresh one-key object, and read the returned ok value without converting it early to Boolean.
- Return a fresh record in this order: revision from the argument; recorded_by exactly align; recorded_at from the parsed record; window as the exact parsed window reference; spend as the exact parsed spend reference only when ok is truthy, otherwise null; spend_hidden as logical negation of that same ok value; bound_sessions; last_activity_at. Do not read the parsed spend field on the denied path. Preserve the parse-before-authorization order, optional legacy behavior and native failures for malformed stored JSON.

The runtime export has only this factory and private helpers. All external
effects pass through the declared resources. No source import, ambient clock,
configuration, environment, filesystem, network, randomness, hidden result cache,
permission substitute or recovery path is allowed.

## Exact SQL interfaces

### Q01 all with 1 bindings

```sql
SELECT * FROM v2_change_request_evidence WHERE change_request_id = ? ORDER BY revision, added_at, id
```

### Q02 get with 2 bindings

```sql
SELECT COUNT(*) AS n FROM v2_change_request_evidence WHERE change_request_id = ? AND revision = ?
```

### Q03 get with 6 bindings

```sql
SELECT MAX(at) AS at FROM (
       SELECT MAX(u.ts) AS at FROM v2_usage u JOIN v2_epochs e ON e.ws_id = u.ws_id AND e.session_key = u.session_key AND e.epoch_id = u.epoch_id WHERE e.ws_id = ? AND e.goal_id = ?
       UNION ALL SELECT MAX(starts_at) FROM v2_epochs WHERE ws_id = ? AND goal_id = ?
       UNION ALL SELECT MAX(at) FROM v2_activity WHERE ws_id = ? AND goal_id = ?
     )
```


#### Scenario: Validate advisory links and preserve recorded goal facts through explicit caller resources

- **WHEN** the Node evidence target is selected
- **THEN** Capture eleven resources once and preserve eight public values, five caller types, exact SQL, delegated kind/text validation, parsed HTTPS and credential refusals, ASCII control label rule, reference/read/effect ordering, two live Date constructor reads, live URL construction, thirty-day recorded snapshots and parse-before-authorization spend hiding. The consuming service owns evidence permissions, persistence, limits and transaction scope.
