# Getting started

[Project guide](../README.md) → getting started

## Purpose

This library provides authorization decisions, goal readability, goal binding and
policy data to Align. Its callable API accepts ordinary JavaScript objects and
ReadonlyMaps. Callers supply the authenticated participant and workspace context.

## Installation and use

Align consumes this internal library from a verified source-cache package.
Standalone registry distribution is not configured. The consumer build checks
package hashes and replays independent acceptance before installation. The library
has no standalone user command or persistent service.

## Contributor verification

Use the framework runtime pinned in `literate.project.json`. After host-execution
authorization, rebuild the component and record its passing receipt:

```sh
CODING_CLI=codex litai rebuild components/policy --target host --allow-host-execution --update-receipt
litai verify
```

The independent acceptance contract covers every supported action and object kind,
workspace roles, team membership Maps, goal visibility, ownership, transfers,
exported data and opaque identifiers. Observations also preserve argument state.

## Development workflow

Use the pinned framework runtime to validate and inspect this library's actual
component:

```sh
litai project validate
litai lock --check
litai plan components/policy
```

Behavior changes belong in `components/policy` and its direct public
contracts. After source-bound review and host-execution authorization, rebuild
that component and repeat its independent qualification before changing release
authority. See the [framework flow](framework-flow.md) and
[project map](project-layout.md) for the owning lifecycle and artifact.
