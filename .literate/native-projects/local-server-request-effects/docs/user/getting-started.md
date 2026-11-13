# Getting started

[Project guide](../README.md) → getting started

This embedded Node library exposes `create_legacy(resources)` and
`create_v2(resources)`. Their provider keys and exact returned namespaces are
declared in `flavors/node-server-request-effects/flavor.md`. The target requires
Node 24 or later on macOS and Linux. Qualification generation runs on macOS;
actual generated consumer checks on Linux remain with the consuming project.

## Usage and ownership

Supply the application's existing configuration, errors, authentication, device,
readiness, network-key and console providers as required by each factory. The
legacy factory needs only its own four resources. Provider implementations and
endpoint handlers remain outside this library. Returned operations work detached.
Credential presence, refusal priority, streamed byte counts and cancellation are
observable behavior. Change the Component or target to change that behavior.

Registration and complete application acceptance remain with
[parent integration](../roadmap/active-work.md#parent-integration).

## Contributor workflow

Inspect current authority with the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-request-effects --target server-request-effects-host-v3 --check
litai plan components/server-request-effects --target server-request-effects-host-v3
litai verify
```

After execution authorization, rebuild and refresh the receipt:

```console
litai rebuild components/server-request-effects --target server-request-effects-host-v3 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild runs generated tests and 46 independent batches across both capabilities.
Cached source must pass current acceptance. The following command copies the
admitted entry into the declared portable project cache:

```console
litai cache publish --project . --target project-committed
```

Preserve source-cache bytes, locks and qualifications. Implementation remains
derived output. See the [framework flow](framework-flow.md) and
[project map](project-layout.md).
