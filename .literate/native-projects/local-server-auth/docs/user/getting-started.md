# Getting started

[Project guide](../README.md) > getting started

This dependency-free CommonJS library requires Node 24 or later on macOS and
Linux. The application supplies its locked Better Auth and passkey adapters.

## Installation and usage

Register this ready child through the consuming project's native-child
plan/apply command and materialize it from the admitted project-committed cache.
Supply the exact 52 resources listed in `flavors/node-server-auth/flavor.md`.
The root README links the Component, target and independent acceptance.
Keep persistence, identity providers, delivery, shared state and host readers in
the caller. No standalone service or separately published npm package is needed.

## Contributor workflow

Use the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-auth --target server-auth-host-v1 --check
litai plan components/server-auth --target server-auth-host-v1
litai verify
```

After execution authorization:

```console
litai rebuild components/server-auth --target server-auth-host-v1 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
litai cache publish --project . --target project-committed
```

A cache hit still requires current independent acceptance. Keep generated code,
qualification and cache records unchanged. Change intent through the Component
and target, then regenerate. A new source qualification also requires the exact
original source and its existing private intake trust key, with explicit policy
intake opt-in when applicable. Read [admitted acceptance](../evidence/admitted-acceptance.json),
the [framework flow](framework-flow.md), and [project map](project-layout.md).
