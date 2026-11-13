# Public interface: server-core.create-core

## ADDED Requirements

### Requirement: server-core.create-core

# Core services and product events

The whole retained `lib/v2/core.mts` and `lib/v2/events.ts` surface belongs to this
Component. Capability `server-core.create-core` binds explicit providers to the
core namespace. Capability `server-core.create-events` binds the event wrapper to
its database, secret and core providers. The concrete factories and JavaScript
rules belong to the selected target.

Preserve the six existing qualified provider aliases by identity. Their settings,
secret and entropy algorithms keep their current owners. The Component owns
creation codes, access-request decisions, workspace administration, content-free
event recording, creation-code email formatting and email delivery orchestration.
Authentication, authorization, schema migration, retention scheduling, request
dispatch and UI behavior retain their separate boundaries.

## Explicit ownership

Construction captures handles without executing effects. Each core instance owns
its exported mutable event tables, arrays and regular expressions. Preserve the
observed shared references within that instance. Separate instances remain
independent except for state deliberately shared through supplied providers.
Operations work detached from their namespace.

The caller owns every database connection, transaction, commit and rollback.
Forward exact statement text and parameter ordering to the caller's SQL port.
Preserve its method receiver, returned row/array identity where observed, strict
changed-row comparisons, failure identity and partial effects before failure.
Do not introduce a transaction, retry, compensating write, cached result or
alternate store. The separate first-read wrapper invokes its supplied transaction
provider under the exact rules below.

## Product event recording

Expose the complete current event table and public constants. Validate each own
enumerable property of supplied event props against the current mutable rule
table before reading a clock or calling SQL. Rules distinguish fixed choices,
nonnegative integer counts and reference patterns. Retain ordinary property lookup,
prototype behavior, getter evaluation and regular-expression state. Do not add
required props, freeze mutable data or bypass later mutations.

Store the supplied event name, nullable workspace and actor, timestamp and JSON
props with the existing conflict-ignoring insert. Storage enforces once-per-workspace
and once-per-person uniqueness. Return true only for the exact successful port
result. Actor identity remains a keyed hash through the supplied hash provider;
the Component does not implement that cryptography.

## Creation codes and access decisions

Make a new code from the existing two entropy calls, code prefix and domain-separated
hash. Return the code only from creation; persist its hash and existing binding and
dates. Preserve default validity, optional request linkage, email cleanup, event
order and the source's loose runtime input behavior. Do not introduce clamping,
new input checks or different defaults.

List codes in the supplied SQL order and derive their current display state using
the original precedence and exact JavaScript timestamp comparison. Revocation and
redemption use the existing guarded single-statement updates. Redemption checks
the public code pattern, unused/unrevoked/unexpired state and optional email
binding. Preserve exact default-clock timing, including refusal paths.

Request listing and lookup preserve query selection and provider identities.
Approve only a pending request, create its bound code, update its decision and
record its approval in the original order. Return the original request object.
Decline records an event only after its exact successful update. Undo revokes the
code, restores the request to pending, then removes the two latest matching
decision events when a truthy original decision time exists. The caller supplies
the surrounding transaction.

## Workspace administration

Summaries expose the existing workspace/member/owner query without adding member
content or sorting its result in application code. Soft deletion changes only a
live workspace, removes its connected-app grants and records the audit row.
Device grants remain for recovery. A refused update performs no later write.

Purge performs the existing ordered explicit cleanup, anonymizes surviving product
events using fresh supplied entropy, removes every occurrence of the workspace
from relevant device-request lists and deletes the workspace. Storage cascades
remove its dependent rows. Cleanup still precedes a final missing-workspace
result. Every device-request JSON value and matching update must be prepared before
any destructive SQL or entropy call. Malformed stored JSON or an unexpected
parsed shape therefore fails before any purge write. This narrow effect-order
correction supersedes the earlier partial-write behavior. Other provider or SQL
failures preserve their identity and remain within caller-owned transactions. This contract does not establish permission to run retention or
delete any operator data.

## Email and event wrappers

Produce the exact approved-code plaintext message, including its sign-in query,
local-address note, line breaks and expiry display. Do not normalize the supplied
origin or add content.

Delivery uses only supplied current fetch, timeout and logging resources. Preserve
request options, cancellation and response checks in order. Fetch/argument
failures and refused HTTP status use the existing logged and mapped failure.
Body access, synchronous cancellation, logging and error-inspection failures keep
their observed propagation behavior. Ignore only the cancellation promise's
rejection. Add no email provider, retry, redirect, real-network fixture or
background delivery queue.

The bound event wrapper resolves the actor only for a truthy user and forwards
the existing nullable/optional fields. The first-read helper skips a truthy
existing event. Otherwise it starts one supplied transaction, records the event
inside its callback and attaches the existing rejection handler. The transaction
callback yields the event provider result. Both explicit rejection handlers yield
no result. The public first-read helper returns void.
Initial lookup and synchronous transaction failures escape; asynchronous
transaction failures are swallowed. Do not widen the catch.

## Evidence and authority transfer

Both hosts match 559 edge records and 16 populated SQLite records. Twenty
operation matrices inject failure at 208 observed positions. Fifty-five valid
adapted-source semantic controls, sixteen binding controls and twenty-one ambient
controls are rejected on each host. The current verifier also rejects the preserved
candidate that lost a transaction callback result and changed event-name coercion. The native Date parsers differ
on one out-of-type string input; raw results are preserved, and portable acceptance
uses an owned Date provider to check the exact constructor operands.

These observations support this bounded two-file contract. They do not establish
complete application, legal, authentication or deployment acceptance. Private
independent verification, two clean generations, separate admission, actual typed
consumers and all callers, full application/image gates and a current parent
receipt remain required. The accepted 31-boundary program and live tester gates
stay open.


## Explicit event-name security correction

Accept event rules only from own keys of the current shared event-rule table.
Preserve the existing key conversion and own getter behavior. Inherited names
are refused before any date, database or network effect. Preserve every other
core and bound-event behavior, including caller-owned transactions and purge
rollback responsibility. This narrow restriction supersedes the earlier
inherited event-name acceptance requirement and its two historical outcomes.
The historical evidence is retained. This is authored corrective intent.


## Explicit purge preflight correction and declaration fidelity

The target defines all device-request parsing, filtering, JSON serialization and
matching ID reads before the original ordered destructive SQL. No helper-owned
transaction is introduced. All original SQL text and final success comparisons
remain exact. This is corrective authored policy, not behavior attributed to old
main. Prior effect traces are preserved as defect history. Public declarations
must match the six actual aliased provider signatures and remain usable by the
unchanged strongly typed current-main callers.

The public soft-delete audit actor accepts string or null, preserving the actual
current-v2 caller contract. All24 helper function parameter tuples and return
types must match current main. This is a declaration correction only.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:39af020d6af210f293b4`, `evidence:7f9c78026af1a2aad996`
