# Getting started

[Project guide](../README.md) → getting started

The embedded library exposes `create_ready(resources)`, returning `ready()`.
Supply the state object and three provider functions documented in the
`flavors/node-server-readiness/flavor.md`. Node 24 or later
on macOS and Linux is required. Construction does not perform migration work.

## Usage and ownership

The actual application supplies its existing global object, `openDb`,
`migrateAuth` and `migrate`. The public operation remains synchronous while
returning the exact shared attempt promise. Failed attempts clear the cache and
allow a later call to retry. Authentication, schema and database execution stay
with their provider owners. Do not add guarded overlap clearing during this
compatibility transfer.

Parent registration and actual consumer acceptance remain with
[parent integration](../roadmap/active-work.md#parent-integration).

## Contributor workflow

Inspect the current authority with the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-readiness --target server-readiness-host-v1 --check
litai plan components/server-readiness --target server-readiness-host-v1
litai verify
```

After execution authorization, rebuild and refresh the receipt:

```console
litai rebuild components/server-readiness --target server-readiness-host-v1 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild runs generated tests and 40 independent observations. Cached source must
pass current acceptance. `litai cache publish --project . --target project-committed`
copies the admitted entry into the declared portable cache. Preserve its bytes.

Change the Component or Flavor to change behavior. Implementation, locks,
qualification records and immutable cache contents remain derived outputs. See
the [framework flow](framework-flow.md) and [project map](project-layout.md).
