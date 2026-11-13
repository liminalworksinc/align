# Getting started

[Project guide](../README.md) -> getting started

Shared promise queues provides one natural JavaScript asynchronous capability.

## Availability

There is no separately published installation. [QUEUES-001](../roadmap/active-work.md)
records the two passing clean builds and admitted package. The parent owns application
integration, source retirement and complete application parity. There are no
credentials, service endpoints, configuration files or persistent state. Queue
state lives in the process's shared Map. The qualification target is macOS;
the complete original matrix also passes Linux Node 24.

## API

The logical package is `promise_queues`. Module `with_lock` exports
`with_lock(key, fn)`, returning a Promise for the callback's original result.
The callback runs once with no receiver or arguments when its key's turn begins.
Its original thrown or rejected value reaches the caller, and completion releases
the next request even on failure. Different keys can run independently. Separate
module instances reuse the process's existing queue Map.

For example, `await with_lock("workspace", async () => ({ok: true}))` resolves to
the exact object returned by the callback. The API adds no delay or timeout.
Keep same-key nested work queued until its outer callback returns: awaiting it
inside that callback waits on the outer callback's own turn. Another key can be
awaited normally. Queue cleanup preserves any later request's tail.

## Development

Read the [framework flow](framework-flow.md) and [project map](project-layout.md).
Run `litai project validate` and `litai lock --check`. After execution authorization,
use `CODING_CLI=codex litai rebuild components/promise-queues --target host
--allow-host-execution --update-receipt`. The reported artifact and locked import
surface define the package files. All 22 independent batches must pass.

The closed verifier uses controlled promises and bounded microtask drains in
isolated processes. It checks both absent and existing global queue initialization,
same-key FIFO and cross-module sharing, independent keys, original return/error
references, callback arguments and receivers, existing and replacement tails,
nested calls, thenables and cleanup. It does not use a wall-clock timing threshold.
