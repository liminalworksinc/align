# Getting started

[Project guide](../README.md) → getting started

This embedded Node library exposes `create_client_keys({config})`, returning
`clientNet` and `clientOf`. Exact resource, operation and export-map requirements
are declared in `flavors/node-server-client-keys/flavor.md`. Node 24 or later is
required on macOS and Linux. Qualification generation runs on macOS; actual
generated consumer acceptance on Linux remains with the consuming project.

## Usage and ownership

Supply the application's existing configuration function. Construction captures
it once without invoking it. `clientNet` uses only supplied text; `clientOf`
consults current mode once and reads the client-IP header only for hosted keys.
The caller owns header trust, rate-limit state and thresholds. Preserve ordinary
loose forms and exact failures when changing the Component or target.

Registration and complete application acceptance remain with
[parent integration](../roadmap/active-work.md#parent-integration).

## Contributor workflow

Inspect current authority with the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-client-keys --target server-client-keys-host-v2 --check
litai plan components/server-client-keys --target server-client-keys-host-v2
litai verify
```

After execution authorization, rebuild and refresh the receipt:

```console
litai rebuild components/server-client-keys --target server-client-keys-host-v2 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild runs generated tests and all 11 independent batches. Cached source must
pass current acceptance. The following command copies the admitted entry into
the declared portable project cache:

```console
litai cache publish --project . --target project-committed
```

Preserve source-cache bytes, locks and qualifications. Implementation remains
derived output. See the [framework flow](framework-flow.md) and
[project map](project-layout.md).
