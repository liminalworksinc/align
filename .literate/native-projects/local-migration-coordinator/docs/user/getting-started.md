# Getting started

[Project guide](../README.md) -> getting started

## Availability

This is an unpublished qualified numbered-migration coordinator. Two independent
clean builds pass all 645 observations in 21 acceptance batches, followed by a
separate admitted build. Qualification covers macOS Node. Actual SQLite consumer
checks also pass on Linux Node 24. The parent owns complete application and image
acceptance, schema authority and the retained historical SQL.

There is no published package or standalone service to install. The parent build
consumes the exact qualified source-cache package through its native binding.
The coordinator imports no database, filesystem, authentication or schema data.

## API

JavaScript module `migration_coordinator/apply_migrations` exports synchronous
`apply_migrations(context)`, returning undefined on success. The context provides
`changeCount`, `readVersion`, `setReferences`, `begin`, `apply`,
`brokenReferences`, `referenceError`, `writeVersion`, `commit`, `rollback` and
`complete`. Each callback is called with the supplied context as its receiver.
Callbacks and their results remain synchronous.

Each remaining numbered change runs in its own immediate transaction. The stored
version advances only with the committed change. Earlier commits survive a later
failure. A rollback failure replaces the original failure; a reference-enabling
failure replaces either. Successful completion runs only after the complete
upgrade or current/future-version no-op. The target adapter owns actual SQLite
operations, historical SQL, reference-error wording and permission finishing.

The Component at `components/migration-coordinator/component.md` links the
complete public contract. Keep connection management, authentication migrations
and the historical schema with their current owners.

## Development

Use the framework runtime pinned in `literate.project.json`.

Read the [framework flow](framework-flow.md) and use the [project map](project-layout.md)
to find the owning authority. Planning does not execute generated code:

```console
litai project validate
litai lock components/migration-coordinator --target migration-coordinator-host-v1 --check
litai plan components/migration-coordinator --target migration-coordinator-host-v1
```

After host execution authorization, run the ordinary lifecycle and current receipt:

```console
CODING_CLI=codex litai rebuild components/migration-coordinator --target migration-coordinator-host-v1 --allow-host-execution --update-receipt
litai verify
```

All 21 independent acceptance batches must pass. These contributor commands do
not publish or install a package. The parent application retains its separate
storage-consumer, image and complete workflow gates.
