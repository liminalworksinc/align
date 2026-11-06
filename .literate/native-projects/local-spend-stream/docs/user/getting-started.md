# Getting started

[Project guide](../README.md) → getting started

## Purpose

Parses one usage line at a time while preserving the caller-owned state used by Align tailer checkpoints. Its capabilities initialize parser state, parse supported usage lines and normalize count and timestamp values.

## Installation and use

This internal library is consumed by Align's build from its verified source-cache
package. Standalone registry distribution is not configured. The consumer build
checks package hashes and reruns independent acceptance before installing it.
Use the application to perform the user workflow; this library has no standalone
user command or persistent service.

## Contributor verification

Use the framework runtime pinned in `literate.project.json`. After authorizing
host execution, rebuild the component and record its passing receipt:

```sh
CODING_CLI=codex litai rebuild components/spend-stream --target host --allow-host-execution --update-receipt
litai verify
```

The accepted specification and independent acceptance cases remain the authority
for generated implementations. A passing rebuild admits package bytes for local
consumption; publication is a separate operation.

## Development workflow

Use the pinned framework runtime to validate and inspect this library's actual
component:

```sh
litai project validate
litai lock --check
litai plan components/spend-stream
```

Behavior changes belong in `components/spend-stream` and its direct public
contracts. After source-bound review and host-execution authorization, rebuild
that component and repeat its independent qualification before changing release
authority. See the [framework flow](framework-flow.md) and
[project map](project-layout.md) for the owning lifecycle and artifact.
