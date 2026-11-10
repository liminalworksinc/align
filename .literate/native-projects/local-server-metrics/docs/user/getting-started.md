# Getting started

[Project guide](../README.md) > getting started

Use the toolchain selected and probed by the Node Flavor. Register the ready child
through the normal native-child plan/apply flow, materialize its admitted committed
cache and import server_metrics/create_metrics. Supply the four target resources
and keep the three public types at the original caller boundary.

```console
litai project validate
litai lock components/server-metrics --target server-metrics-host-v1 --check
litai plan components/server-metrics --target server-metrics-host-v1
litai verify
```

After execution authorization:

```console
litai rebuild components/server-metrics --target server-metrics-host-v1 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
litai cache publish --project . --target project-committed
```

For original-source qualification, set ALIGN_NATIVE_QUAL_REPOSITORY to the owning
Align checkout. The profile addresses readable verifier files relative to that
repository and verifies their exact bytes. Consumer acceptance uses its captured,
self-contained verifier. The supplied repository root remains an explicit port.

Every reuse requires current acceptance. Change intent through the Component and
target, then regenerate. Preserve failed outputs and immutable evidence. Read
[admitted acceptance](../evidence/admitted-acceptance.json),
[framework flow](framework-flow.md), and [project map](project-layout.md).
