# Node-Server-Sample implementation Flavor

## ADDED Requirements

### Requirement: Node sample service calling and asset binding [authored:node-server-sample-v2]

# Sample workspace Node target

Provide package `server_sample`, named synchronous arity-one factory `create_sample` from `server_sample/create_sample`. Return exactly the three string constants `SAMPLE_NAME`, `SAMPLE_REASON`, `SAMPLE_LIMIT_TEXT` and asynchronous arity-three `createSampleWorkspace`.

Capture these ten resources exactly once, in order: `audit`, `run`, `newId`, `insertAlignment`, `insertChangeRequest`, `goalRow`, `insertGoal`, `newLimitId`, `createWorkspace`, `readDate`. Do not enumerate the container. Supplied functions are bare calls with undefined receivers. Construction captures references without calling services, resolving Date or performing effects. Throwing property getters propagate unchanged at the exact capture position and stop later reads.

Use the ordinary immutable asset at `source/server_sample/sample-text.json`, asset id `sample-text`, media type `application/json`, SHA-256 `c502a40c1af1342250b646e8bbba9e0bb97e77b49c6b045db156b201be3008f3`. It is an exact source-backed asset, never generated output. Its schema has string fields `workspace_name`, `change_request_reason`, `limit_text`, `limit_source_title`; two ordered `team_names`; three ordered `goals` with `title` and measure records containing `text` and nullable `target`; and one `pending_measure` with `text` and `target`.

The Node package is CommonJS with a relative ordinary JSON require during module loading. Bind asset values at module initialization. Exported constant values are strings taken from the declared asset. A factory instance does not call any supplied asset-loading service. Preserve package custody and loader availability on both macOS and Linux and through the application bundler. Require the same pinned asset in the admitted package. Do not embed or recreate its payload in generated JavaScript.

Every invocation reads caller user identity before calling ordinary workspace creation. Pass the original request, principal, asset workspace name and code, plus a synchronous arity-two seed callback. The asynchronous function resolves to the ordinary creation result object without replacing it. Preserve rejections by identity.

Each service instance owns one empty mutable anchors object with `repos`, `branch_patterns` and `issues` arrays. All seeded goal arguments and repeated calls through that instance share it. Separate factory instances, including two factories constructed from the same imported module, own different anchors. Do not freeze it or clone it per goal. Measures, limits, request bodies, principals, team maps and other per-call values are new where the current module creates new values. Never pass a mutable imported asset record to a supplied callback; construct the new records while retaining the asset's immutable primitive values.

Inside the seed, create a new Map and one principal with caller identity, seed workspace identity, owner workspace role and that Map. Create Product before Security through the asset's ordered names. Each team allocates `newId("pod")`, performs the exact team insert, audits `team.created`, performs the exact lead-membership insert, audits `team.member_set`, then sets that team's Map role to lead. Preserve four-argument binding tuples and the current creation timestamp. Both team statements and bindings are specified by the workspace physical storage contract.

For every newly constructed measure, call `newId("m")` before reading its text and target into a new `{id, text, target}` record with the exact asset values. Preserve evaluation order of the original arguments: asset primitive retrieval itself performs no supplied effects. A newly constructed limit calls `newLimitId()` and has type `must_not`, asset limit text and a fresh source object with kind `meeting`, asset source title and the seed creation timestamp's first ten characters.

Insert the company goal first with company level, null team, workspace visibility, its one measure, shared anchors and an empty dependency list. Insert security review second with team level, Security team, workspace visibility, its two measures, shared anchors, an empty dependency list and its one new limit. Insert onboarding third with team level, Product team, workspace visibility, its one measure, shared anchors and the security-review identity as its dependency. Preserve object-property evaluation and operation order. Timestamp arguments are computed after the corresponding goal-body arguments.

Each timestamp computation selects the current Date constructor through `readDate()`, then separately selects the current parse receiver through another `readDate()` call, parses the original seed timestamp, adds the exact offset and constructs its ISO string. Offsets in insertion order are zero, two and one milliseconds. Keep each static method's selected receiver and each separately selected constructor. Do not cache Date across conversions, across operations or across the two reads of one conversion. Preserve invalid-date failures.

After the three insertions, fetch the company row once. Fetch onboarding then security review for two contribution calls. Each receives the same principal, same company-row reference, its source row, `contribution`, a new empty session list, null note and unmodified creation timestamp. Do not add missing-row validation before the supplied contribution service; preserve the argument and that service's failure behavior.

Fetch security review again, read its stored `measures_json`, parse it with ordinary JSON parsing, spread the parsed iterable into a new measure array, then construct and append the asset pending measure. Call the supplied change-request insertion with the same principal, same review-row reference, a fresh body with that array, asset reason and original timestamp. Preserve missing-row, malformed JSON, noniterable parsed values, getter and supplied-error behavior. The seed has an undefined return.

Generate a CommonJS package manifest with name `server_sample`, type `commonjs` and export `./create_sample` mapped to `./create_sample.js`. The workspace package uses corresponding name `server_workspaces` and export `./create_workspaces`. Each source tree also provides the framework-required generated-test adapter in `main.js`. No undeclared dependencies, ambient environment, database, network, clock or identity implementation belongs in either generated package. JSON, Map, ordinary deterministic language operations and the declared immutable asset are available. A private verifier's VM guards are conformance checks and supply no OS security-boundary claim.


## Exact storage bindings

For each team use the bare supplied `run` with statement `INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)` and ordered arguments new team identity, seed workspace, asset team name and creation timestamp. For its owner use `INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, 'lead', ?)` with ordered arguments seed workspace, new team identity, caller identity and timestamp. Preserve the original strings exactly. Goal, contribution, limit and change-request writes are supplied operations rather than generated storage programs.

## Exact principal records and supplied service arguments

The incoming principal is the original web principal object. Read its caller identity as `principal.user.id`, with the nested user read before its id. Do not read `principal.userId`. Pass the original request and original principal by identity to `createWorkspace(req, principal, SAMPLE_NAME, code, seed)` as exactly five arguments. The code is passed unchanged.

The seed principal has exactly these keys in insertion order: `{ userId, wsId, wsRole: "owner", pods }`. Here `userId` is the captured nested caller identity, `wsId` is the seed argument and `pods` is the newly created Map. The public policy-principal key is `pods`. Do not rename it to `podRoles` or use a stored database column name.

The audit port is the synchronous five-argument operation `audit(wsId, actorId, action, objectId, at)`. For team creation call `audit(wsId, userId, "team.created", id, at)` after its insert. For its lead membership call `audit(wsId, userId, "team.member_set", id, at)` after that insert. Preserve exactly five arguments. The request, object kind and metadata body are not audit arguments.

The goal service accepts `insertGoal(principal, body, at)` and returns a string goal identity. Its body uses the camel-case service keys `podId` and `dependsOn`, independently of the storage's snake-case columns. Construct these exact records in the shown property order:

- Company: `{ title, level: "company", podId: null, visibility: "workspace", measures, anchors, dependsOn: [] }`.
- Security review: `{ title, level: "team", podId: security, visibility: "workspace", measures, anchors, dependsOn: [], limits }`.
- Onboarding: `{ title, level: "team", podId: product, visibility: "workspace", measures, anchors, dependsOn: [review] }`.

Titles, measures and limits use only the primitive values of the declared asset. The `anchors` value is the one shared object owned by this factory instance. Keep these exact object shapes and omit `limits` on company and onboarding, as the current code does.

The remaining exact bare service tuples are `run(statement, ...bindings)`, `newId(prefix)`, `newLimitId()`, `goalRow(wsId, goalId)`, `insertAlignment(principal, companyRow, sourceRow, "contribution", [], null, at)`, and `insertChangeRequest(principal, reviewRow, { measures }, SAMPLE_REASON, at)`. Every team insert has the four binding arguments specified above. Preserve undefined receivers and exact argument counts.

Each measure is a fresh `{ id, text, target }` record. Its identifier allocation happens first. Each limit is a fresh `{ id, type: "must_not", text, source: { kind: "meeting", title, date } }` record. The principal and all three goal bodies use the exact key names above. Do not substitute physical column names into public service records.


#### Scenario: Complete sample creation, ordered seed and transaction failure surface

- **WHEN** the Node workspace target is selected
- **THEN** Capture the ten ordered resources once, expose three string constants and the async arity-three creation operation, consume the exact ordinary asset, preserve seed effects, shared anchors, separate Date reads, hosted admission and rollback.
