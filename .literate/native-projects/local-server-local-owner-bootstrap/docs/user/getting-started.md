# Getting started

[Project guide](../README.md) > getting started

This dependency-free CommonJS library requires Node 24 or later on macOS and
Linux. The package server_local_owner_bootstrap exposes the named factory
create_local_owner_bootstrap and its asynchronous ensureLocalOwner operation.

## Installation and usage

Register this ready child through the consuming project's supported native
library plan/apply command and materialize it from the admitted portable cache.
Supply the seven exact resources in `flavors/node-local-owner/flavor.md`.
The root README links the Component and target. Keep the configured provider,
store, headers, environment readers and reporting ownership in the caller.
There is no standalone service installer or separately published npm package.
See [parent integration](../roadmap/active-work.md#parent-integration).

## Contributor workflow

Use the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-local-owner-bootstrap --target local-owner-host-v1 --check
litai plan components/server-local-owner-bootstrap --target local-owner-host-v1
litai verify
```

After execution authorization:

```console
litai rebuild components/server-local-owner-bootstrap --target local-owner-host-v1 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
litai cache publish --project . --target project-committed
```

A cache hit still requires current independent acceptance. Preserve generated
code, qualification and cache records. Change intent through the Component and
target, then regenerate. Read [admitted acceptance](../evidence/admitted-acceptance.json),
the [framework flow](framework-flow.md), and [project map](project-layout.md).
