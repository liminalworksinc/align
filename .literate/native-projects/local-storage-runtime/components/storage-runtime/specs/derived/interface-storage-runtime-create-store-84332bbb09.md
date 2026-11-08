# Public interface: storage-runtime.create-store

## ADDED Requirements

### Requirement: storage-runtime.create-store

# Bound storage service


Capability `storage-runtime.create-store` binds one storage service to caller-owned
configuration, storage, scheduling and already-qualified helper resources. The
selected target defines concrete representations, public names and backend
operations. This contract contains no backend programs or platform setup commands.

The public boundary covers the complete existing database adapter, rather than
only its connection-opening subset. It includes path helpers, shared connections,
prepared operations, the statement-helper record, atomic callback execution,
migration resource binding, successful-invocation file protection and the live
workspace query condition and audit-event recording. The adjacent core module retains its other signing,
secret-file, event, creation, access, purge and email responsibilities.

## Binding and dependencies

Capture the supplied resources for the binding. Obtain the schema program set
once and verify that its size agrees with the supplied expected schema version.
A mismatch fails before consulting storage paths, opening connections or changing
the filesystem. Do not copy schema programs or migration ordering into this
Component. The program provider, migration coordinator and wording provider keep
their independently qualified authority.

Binding itself does not open storage, read application configuration, perform
filesystem operations, request randomness or schedule work. Different bindings
can share a caller-supplied storage context; their local transaction-nesting
state remains separate.

## Shared storage and operations

Create the configured storage resources lazily. When the shared context already
contains a connection bundle, return that same bundle and resources. Publish a
new bundle only after initialization succeeds. Configuration changes do not
silently replace an existing bundle. Path helpers continue to consult the current
configuration. A handle closed by its caller remains the same cached handle;
this service introduces no automatic replacement or new lifetime policy.

The target supplies the authentication and application connection roles. Preserve
their distinct handles, required settings and declared access modes. Propagate
resource failures as the same thrown value, without substituting another error.

Prepare a caller query once per exact query text and reuse its statement in the
shared bundle. Keep parameters specific to each invocation. Forward queries and
parameters without rewriting, stringifying, normalizing or cloning them. Return
the backend's row values and absent-result representation unchanged. Preserve
binary values, large integers, row representation and driver failures. Failed
preparation does not publish a cached statement. The target's public statement
cache remains available to existing callers.

The statement-helper record exposes the same function objects as the matching
service operations. Every service operation works as a detached function.
Preserve the target's public names and required argument counts.

## Atomic callback execution

Acquire the application write boundary before entering the caller's callback.
When acquisition reports contention, yield through the supplied scheduler and
retry within the selected target's budget. Do not enter the callback during
acquisition retries. Other acquisition failures propagate without retry.

Run the callback synchronously after acquisition. The outer callback's outcome
controls its transaction: commit a permitted successful result; attempt rollback
after a callback failure, a target-declared forbidden asynchronous result or a
commit failure. Preserve the original failure even if rollback also fails.
Always restore local nesting state after leaving the outer boundary. A later
transaction must remain atomic after any preceding failure.

A nested invocation joins the current binding's boundary without opening or
closing another one. Preserve its completion and error representation. A nested
rejection that the outer callback handles does not replace that callback's
successful return. The target specifies the asynchronous completion type and
the distinctions between its native asynchronous values and ordinary thenables.

Do not rerun a callback after it has entered. Do not retry callback, commit or
rollback failures as acquisition contention.

## Migration resource binding

Invoke the supplied coordinator once per migration request. Provide its declared
version-reading, reference-enforcement, transaction, selected-program execution,
reference-counting, version-writing and completion resources. The reference-checking resource returns a count of violations rather than the backend records. The supplied
coordinator owns their order, rollback behavior and the stored-version-at-least-
current no-op path. Preserve its thrown value.

Supply reference-error wording through the existing qualified wording provider.
Keep singular and plural diagnostics and the reported migration number. Complete successful and no-op invocations with the target's file-protection operation on the actual cached storage resource, even when configuration subsequently changes.
Do not complete a failed upgrade or introduce an independent future-version
refusal in this adapter.

## Live workspace condition

Return the target query condition identifying workspaces that exist and have not
been deleted. Preserve the caller's trusted expression and the target's exact
public query-text representation. The caller owns the expression's trust and
parameter binding. Keep the backend's null semantics and qualified-column use.

## Audit-event recording

Record the caller's workspace, actor, action, object identifier and occurrence
text in their supplied order through the ordinary prepared write operation.
Preserve nullable workspace, actor and object values and exact text, including
quotes and parameter-like characters. Return the existing empty completion value
and propagate a storage failure unchanged. The selected target owns the physical
field mapping and prepared statement representation.

## Acceptance and scope

The frozen reference observes all thirteen existing exports, forty-three cases and thirteen
negative controls on macOS and Linux. It uses real filesystem and database
resources, the actual qualified dependencies, and disclosed fixture-only fault
injection. A real-timer case proves event-loop progress; accelerated exhaustion
checks the requested delay and retry budget without claiming wall-clock timeout
qualification.

Source-free generation, two clean qualifications, separate admission, complete public type
and consumer compatibility, complete application/image acceptance and a current
receipt are still required before replacing retained implementation authority.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:a0a8e218dd0a74dda57c`, `evidence:b9015276730300c9ae9e`
