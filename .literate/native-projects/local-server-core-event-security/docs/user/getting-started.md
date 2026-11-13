# Getting started

[Project guide](../README.md) > getting started

Import server_core/create_core, server_core/create_events. Supply the exact resources from the selected Node Flavor.
Change the Component or Flavor to change behavior, then regenerate. Preserve
original observations and failed candidates. Generated runtime is replaceable.

After local execution authorization, consume the reviewed committed cache and
run current acceptance:

```console
litai project validate
litai lock components/server-core --target server-core-host-v8 --check
litai rebuild components/server-core --target server-core-host-v8 --allow-host-execution --update-receipt
litai verify
litai project test-receipt require-current --project .
```

Register this child through the normal native-child plan/apply flow. Every cache
reuse still requires acceptance. Qualification uses repository-relative profile
paths with an explicitly supplied repository root. Runtime acceptance uses the
self-contained verifier. Read [local evidence](../evidence/admitted-acceptance.json),
[framework flow](framework-flow.md), and [project map](project-layout.md).
