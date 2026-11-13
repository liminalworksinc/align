# Getting started

[Project guide](../README.md) > getting started

This dependency-free Node library exposes `create_account` and
`create_lifecycle` through the two modules named in the Component contract `components/server-account-lifecycle/component.md`.
Its production package is CommonJS. Node 24 or later is required on macOS and
Linux. Qualification runs on macOS; the distinct admitted package passes the
same public acceptance and binding checks on both hosts.

## Installation and usage

The consuming project registers this ready child through its supported native
library plan/apply flow, then materializes its declared `server_account_lifecycle`
binding from the admitted portable cache. A standalone npm distribution or
service installer is not provided. Parent registration and application delivery
remain owned by [parent integration](../roadmap/active-work.md#parent-integration).

Import `create_account` from `server_account_lifecycle/create_account` or
`create_lifecycle` from `server_account_lifecycle/create_lifecycle` through the
parent's materialized binding. Supply the exact resources declared by the
Node target `flavors/node-account-lifecycle/flavor.md`. Account captures
21 resources and membership captures six. Construction does not call providers.
Keep the exact SQL handle, caller-owned transaction behavior, bare calls,
public error objects and operation return values.

`LIVE_WS` is callable and is used at the declared membership projection point.
Account cleanup calls the explicit supplied `onMemberRemoved` service. Provider
table discovery preserves literal underscore prefixes, exact `userId` column
casing, raw metadata preparation failures and all-table rollback. Preserve the
host's existing module cycle by resolving cyclic services at operation time.
The library reads no host environment or application source and adds no fallback.

## Contributor workflow

Use the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-account-lifecycle --target account-lifecycle-host-v2 --check
litai plan components/server-account-lifecycle --target account-lifecycle-host-v2
litai verify
```

After execution authorization, refresh the build and current receipt:

```console
litai rebuild components/server-account-lifecycle --target account-lifecycle-host-v2 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild runs generated smoke tests and all four independent acceptance batches.
A cache hit still requires current acceptance. Copy the admitted entry into
the declared portable cache with the supported local command:

```console
litai cache publish --project . --target project-committed
```

Preserve generated cache bytes, locks and qualification evidence. Change intent
through the Component and target, then regenerate. Never patch generated
implementation. Read [admitted acceptance](../evidence/admitted-acceptance.json),
the [framework flow](framework-flow.md) and [project map](project-layout.md).
