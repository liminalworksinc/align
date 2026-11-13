# Getting started

[Project guide](../README.md) > getting started

Import server_workspace_reporting_routes/create_workspace_reporting_routes. Supply the exact resources from the selected Node Flavor.
Change the Component or Flavor to change behavior, then regenerate. Preserve
original observations and failed candidates. Generated runtime is replaceable.

After local execution authorization, consume the reviewed committed cache and
run current acceptance:

```console
litai project validate
litai lock components/server-workspace-reporting-routes --target server-workspace-reporting-routes-host-v1 --check
litai rebuild components/server-workspace-reporting-routes --target server-workspace-reporting-routes-host-v1 --allow-host-execution --update-receipt
litai verify
litai project test-receipt require-current --project .
```

Register this child through the normal native-child plan/apply flow. Every cache
reuse still requires acceptance. Qualification uses repository-relative profile
paths with an explicitly supplied repository root. Runtime acceptance uses the
self-contained verifier. Read [local evidence](../evidence/admitted-acceptance.json),
[framework flow](framework-flow.md), and [project map](project-layout.md).
