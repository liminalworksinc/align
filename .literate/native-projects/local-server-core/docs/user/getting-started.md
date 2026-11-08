# Getting started

[Project guide](../README.md) → getting started

This embedded Node library exposes `create_core` and `create_events` through the
two exact modules declared in `flavors/node-server-core/flavor.md`. Production
uses the canonical `server_core` CommonJS package. Node 24 or later is required
on macOS and Linux. Qualification runs on macOS; actual parent consumers and
Linux application acceptance remain with the consuming project.

## Usage and ownership

Supply existing caller-owned providers in the declared construction order. The
core factory captures nine container keys, then three settings and identifier
aliases. The event factory captures six keys. Construction does not invoke the
captured services. Current Date, fetch, AbortSignal, console and URLSearchParams
services are resolved at the original operation points. Preserve the exact
26 SQL statement templates, strict result checks, shared values, callbacks,
message coercion, property-read order and original failure behavior.

Registration and complete application acceptance remain with
[parent integration](../roadmap/active-work.md#parent-integration).

## Contributor workflow

Inspect current authority with the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-core --target server-core-host-v3 --check
litai plan components/server-core --target server-core-host-v3
litai verify
```

After execution authorization, rebuild and refresh the receipt:

```console
litai rebuild components/server-core --target server-core-host-v3 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild runs generated tests and all 53 independent batches. Cached source must
pass current acceptance. This command copies the admitted entry into the declared
portable project cache:

```console
litai cache publish --project . --target project-committed
```

Preserve source-cache bytes, locks and qualifications. Implementation remains
derived output. See the [framework flow](framework-flow.md) and
[project map](project-layout.md).
