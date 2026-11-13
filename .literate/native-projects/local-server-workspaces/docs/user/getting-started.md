# Getting started

[Project guide](../README.md) > getting started

This dependency-free CommonJS library requires Node 24 or later on macOS and Linux.

## Installation and usage

Register this ready child through the consuming project's native-child plan/apply
flow. Materialize the admitted project-committed cache and import
server_workspaces/create_workspaces. Supply all 37 resources in the Node target.
Keep physical storage, identity, authorization, caps and host readers in callers.
The root README links the Component, target and independent acceptance.

## Contributor workflow

Use the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-workspaces --target server-workspaces-host-v1 --check
litai plan components/server-workspaces --target server-workspaces-host-v1
litai verify
```

After execution authorization:

```console
litai rebuild components/server-workspaces --target server-workspaces-host-v1 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
litai cache publish --project . --target project-committed
```

Every cache reuse requires current independent acceptance. Keep generated code,
qualification and immutable cache records unchanged. Change behavior through the
Component and Node target, then regenerate. Qualification requires the exact
corrected source retained separately by the consuming project.
Read [admitted acceptance](../evidence/admitted-acceptance.json),
the [framework flow](framework-flow.md), and [project map](project-layout.md).
