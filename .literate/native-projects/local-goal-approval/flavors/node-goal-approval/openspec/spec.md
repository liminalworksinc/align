# Node-Goal-Approval implementation Flavor

## ADDED Requirements

### Requirement: Node approval query binding [authored:node-goal-approval-v1]

# Goal approval Node binding

Target for package `goal_approval`, named synchronous arity-one factory `create_approval(resources)` at `goal_approval/create_approval`. Capture the one resource `all` exactly once without enumerating the container or calling it during construction. A throwing getter propagates by identity. Return exactly `approvalSet`, `effectiveSet` and `launchSet`, ordinary functions of arities one, two and two with those exact names. Call them and the supplied query service with undefined receivers.

The goal record has fields `id`, `ws_id`, `owner_id`, `pod_id` and optional `level`. The helper never reads `id`. Preserve the exact string `company` comparison for level. A team query runs only when `pod_id` is truthy. Do not add field normalization, format checks or validation. Query rows provide `user_id` string fields. Each query returns its own current array; later queries can observe changed membership.

The supplied synchronous query service is `all(statement, ...bindings)`. Use these exact programs and binding order:

- Eligible members: `SELECT user_id FROM v2_members WHERE ws_id = ? AND role IN ('owner','member')`, with workspace identity.
- Workspace owners: `SELECT user_id FROM v2_members WHERE ws_id = ? AND role = 'owner' ORDER BY user_id`, with workspace identity.
- Team leads: `SELECT user_id FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND role = 'lead'`, with workspace identity then team identity.

`approvalSet` first reads the goal owner and creates its candidate set. Read the team field for the condition; when truthy, evaluate workspace then team again for the query arguments, query leads and add each returned user identity. Read level next. For a company goal, separately read workspace, query current owners and add their identities. Finally read workspace again and query eligible members. Filter the candidate set by that eligibility set, then sort a new array with ordinary JavaScript string ordering.

`effectiveSet` completes `approvalSet` before reading the goal owner for the requester comparison. Return that base array if the requester is the goal owner and appears in it. Otherwise form the array without the requester. Return it when nonempty. Only for an empty result, read workspace again, query owners and return their identities without the requester. Preserve the fallback query's row order; it has its own SQL ordering. Do not add a separate JavaScript sort or deduplication to that fallback.

`launchSet` completes `effectiveSet` first, then separately reads workspace and queries owners even when an earlier operation queried them. Deduplicate the concatenated identities and sort a new array with ordinary JavaScript string ordering. Preserve fresh result arrays across invocations and no retained per-goal or membership state.

A query error, row getter error or goal getter error propagates without wrapping or recovery. Preserve conditional field reads and do not read later fields or issue later queries after a failure. Plain arrays, sets and deterministic language operations are available. No ambient configuration, database implementation, clock, randomness, filesystem, environment, host import or network belongs in this package.

Use a CommonJS manifest named `goal_approval`, type `commonjs`, export `./create_approval` to `./create_approval.js`. Supply the ordinary framework generated-test adapter `main.js`. Original source, private profiles, observations and reference facades remain outside generation requests. Private VM guards are conformance checks. No operator or independent security review is claimed by this target.


#### Scenario: Exact consent sets, requester fallback and launch membership

- **WHEN** the Node approval target is selected
- **THEN** Capture the single query service once, preserve three synchronous public operations and exact conditional property/query effects, current membership, requester fallback, SQL versus JavaScript order and error identity.
