# Getting started

[Project guide](../README.md) → getting started

This project produces an embedded library for the application's native-library
preparer. `create_startup(context)` binds real caller-owned resources and returns
the existing zero-argument `startup()` operation.

## Installation and usage

Parent registration and typed host integration remain with
[parent integration](../roadmap/active-work.md#parent-integration). This child
provides a qualified package and an admitted local cache.

The Node target supports Node 24 or newer on macOS and Linux. Bind the 19 functions
documented in `flavors/node-server-startup/flavor.md`. Construction captures those
functions without effects. Startup validates, checks the current phase, manages
the PID record, sweeps matching leftover files, delivers warnings and registers
exit cleanup. The callback retains its original PID path and preserves a
replacement record. Startup adds no atomic process-claim guarantee.

Configuration, OAuth policy and the later instrumentation sequence keep their
existing owners. Runtime files belong to the caller's data directory.

## Contributor workflow

Inspect current authority with the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-startup --target server-startup-host-v2 --check
litai plan components/server-startup --target server-startup-host-v2
litai verify
```

After execution authorization, rebuild and refresh the receipt:

```console
litai rebuild components/server-startup --target server-startup-host-v2 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild runs generated and independent acceptance. Cached source must pass current
acceptance. The private oracle has 40 batches covering 78 source observations and
one target-binding observation. `litai cache publish --project . --target project-committed`
copies the admitted entry into the declared portable cache. Preserve its bytes.

Change the Component or Flavor to change behavior. Implementation, locks,
qualification records and immutable cache content remain derived outputs. See the
[framework flow](framework-flow.md) and [project map](project-layout.md).
