# Public interface: server-readiness.create-ready

## ADDED Requirements

### Requirement: server-readiness.create-ready

# Shared database readiness

Capability `server-readiness.create-ready` binds a readiness operation to a
caller-owned shared cache and three ordered providers: open the application
store, prepare authentication storage, then apply application migrations.
Concrete names, cache representation and asynchronous host semantics belong to
the selected target. Those providers retain authority for their own work.

## Binding and state

Capture the supplied state reference and provider handles without invoking any
provider or reading the cache at construction. Later replacement of the supplied
container's properties does not redirect the existing binding. Return only one
detachable readiness operation. The binding and the public operation are created
synchronously.

Bindings given the same state reference share its current cache. Independent
state references remain independent. Do not maintain a second private cache or
use process-global state other than the explicitly supplied state reference.
Preserve unrelated state properties.

## Attempt and sequencing

If the cache contains an effective existing result, return that same value
without running any provider. The target defines which values count as absent.

For an absent cache, start opening the store synchronously, then invoke
authentication preparation and await only that provider's completion. After it
succeeds, invoke application migration. Ignore the opening and application
migration providers' return values. The attempt resolves without a value after
the application migration invocation succeeds. Do not await those two ignored
results or inspect them for asynchronous behavior.

Publish the attempt's promise in the supplied cache after the initial synchronous
provider work has begun. Callers arriving after publication receive that exact
same promise, during the attempt and after success. Do not wrap it in another
promise or automatically clear successful readiness.

Provider return and error behavior follows the target. Opening and authentication
invocation occur before the initial readiness call returns. The application
migration occurs only after the authentication await yields, including when
authentication returns a non-promise result. A synchronous provider throw becomes
the attempt's rejection. Initial cache access or assignment failures retain their
ordinary synchronous behavior, including already-started effects.

## Failure, retry and externally changed state

On an attempt's rejection, clear the supplied cache and rethrow the same rejected
value. Stop at the failing provider; do not invoke later providers. Cache clearing
is unconditional, including when another caller has replaced the cache. A failure
while clearing replaces the original rejection with that clearing failure.

A later readiness call can retry after clearing, creating a distinct attempt
that begins with opening again. Calls before clearing still receive the same
failing attempt. No automatic retry, rollback, cancellation, timeout or logging is
added.

Successful completion does not restore or overwrite externally changed cache
state. If a caller clears the cache while an attempt is pending, another call
may start a second attempt. An older failed attempt still clears a newer cached
attempt. This observed overlap behavior is preserved for compatibility; this
transfer does not claim to repair it.

Reentrant calls made by a provider before initial cache publication retain the
target's ordinary evaluation order. Do not introduce an early placeholder that
changes the observed bounded reentrant case.

## Acceptance and authority

Forty exact source observations match on macOS and Linux. They include detached
and shared API identity, one hundred concurrent callers, cached and independent
state, stage failures, exact rejection values, retries, ignored results,
thenables, external replacement, overlapping attempts and bounded reentrancy.
Twelve altered source controls are rejected on both hosts. State and migration
providers are explicit observation resources; this is not whole-database or
authentication qualification.

Two independent clean generations, separate admission, actual consumer/type
parity, complete application and image acceptance, and a current parent receipt
remain required before release authority transfers. Schema, authentication,
database execution, request effects and the rest of instrumentation retain their
existing owners.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:f65a9469622ab6738f1f`
