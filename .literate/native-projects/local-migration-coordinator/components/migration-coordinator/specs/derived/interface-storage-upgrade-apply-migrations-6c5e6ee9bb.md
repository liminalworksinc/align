# Public interface: storage-upgrade.apply-migrations

## ADDED Requirements

### Requirement: storage-upgrade.apply-migrations

JavaScript module migration_coordinator/apply_migrations exports apply_migrations(context):undefined.

# Numbered store upgrades

Apply an ordered sequence of numbered changes to a persistent store. The stored
version is the last completely committed change. An invocation reads that version
once. When the stored version is at least the number of changes, complete the
invocation without changing reference enforcement or starting a transaction.

Otherwise disable reference enforcement before starting any transaction. For
each remaining change, in increasing one-based order: begin an immediate write
transaction; apply that change; inspect broken references; reject a nonzero count;
write that change's version; commit. Earlier changes remain committed if a later
one fails. Do not combine the sequence into one transaction, skip a remaining
change, retry it automatically or undo an earlier commit.

After an attempt to begin a change succeeds, every error while applying it,
checking references, constructing a broken-reference error, writing its version
or committing causes one rollback attempt. If rollback succeeds, rethrow the
same error value. If rollback throws, its error replaces the earlier one. A
failed begin receives no rollback. Always attempt to enable reference enforcement
after entering the disabled-reference phase, including a failed begin or rollback.
An enable failure replaces any earlier failure. If the initial disabling operation
fails, do not enable references, roll back, start a change or complete.

Complete only after the no-op path or the entire upgrade succeeds and reference
enforcement has been enabled. Do not complete after any failed upgrade. Callbacks
are synchronous. Preserve every thrown value by identity when cleanup does not
replace it. Successful invocations return no value. The completion callback is a
target operation that returns no value, matching the retained permission helper.
If completion itself throws, propagate that value without rolling back committed
changes or running cleanup again.


## Target interface

Capability `storage-upgrade.apply-migrations` maps to module
`migration_coordinator/apply_migrations`, exporting synchronous
`apply_migrations(context)`. It receives an ordinary context with these members:

| Member | Obligation |
| --- | --- |
| `changeCount` | Nonnegative integer number of available changes |
| `readVersion()` | Return the nonnegative integer stored version |
| `setReferences(enabled)` | Set reference enforcement outside a transaction |
| `begin()` | Begin one immediate write transaction |
| `apply(version)` | Apply the selected one-based change inside the transaction |
| `brokenReferences()` | Return the nonnegative integer broken-reference count |
| `referenceError(version, count)` | Return the error value for a nonzero count |
| `writeVersion(version)` | Write the version in the same transaction |
| `commit()` | Commit the change and its version together |
| `rollback()` | Roll back the current change |
| `complete()` | Apply target-specific successful-invocation finishing work |

The context members remain stable for the duration of an invocation. Call every
callback with the supplied context as its receiver. Use `changeCount` as the
number of available changes. No callback result other than
`readVersion`, `brokenReferences` and `referenceError`
affects behavior. Do not await, clone or serialize callbacks, return values or
errors. The routine has no persistent or process-global state and imports no
database, filesystem, authentication, application configuration or schema data.

The real target adapter binds the existing database handle, the still-retained
historical SQL sequence, exact SQLite operations and the separately qualified
wording function. Its reference error remains `migration N left X broken
reference(s)` with the wording library choosing singular or plural. Successful
finishing keeps the existing database/WAL/SHM mode behavior. Adapters preserve
their natural error values; the coordinator adds no validation of driver output.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:a96e31cefc215e2e2feb`
