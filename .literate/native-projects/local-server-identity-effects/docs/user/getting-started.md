# Getting started

[Project guide](../README.md) > getting started

This dependency-free Node library exposes `create_effects` from
`server_identity_effects/create_effects`. The production package is CommonJS.
Node 24 or later is required on macOS and Linux. Qualification runs on macOS;
the separate admitted package passes real filesystem and configured-provider
acceptance on both macOS and Linux.

## Ownership

Supply the 15 handles declared in the Node target. Construction reads each once
without calling or validating providers. Callers own current configuration,
delivery, path/filesystem methods, captcha integration and the existing public
error constructor. The four host readers resolve URLSearchParams, console,
fetch and AbortSignal at operation time. Keep the exact public function names,
arities and asynchronous kinds, two literal constants, detached calls, method
receivers and failure identity.

The host's configured captcha provider is an external supplied resource. It is
not a package dependency of this library. Direct captcha verification and the
delegated middleware retain their distinct documented predicates. Local
delivery replaces sign-in.txt and enforces 0600 after writing.

## Contributor workflow

Use the pinned runtime and configured provider:

```console
litai project validate
litai lock components/server-identity-effects --target identity-effects-host-v1 --check
litai plan components/server-identity-effects --target identity-effects-host-v1
litai verify
```

After execution authorization, refresh the build and receipt:

```console
litai rebuild components/server-identity-effects --target identity-effects-host-v1 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild runs generated tests and all four independent batches. A cache hit still
requires current acceptance. Copy the admitted entry into the declared portable
cache with the supported local command:

```console
litai cache publish --project . --target project-committed
```

Preserve cache bytes, generated locks and qualification evidence. Change intent
through the Component and target, then regenerate. Never patch the generated
implementation. Registration, consuming imports and full application/image
acceptance remain with [parent integration](../roadmap/active-work.md#parent-integration).
See the [framework flow](framework-flow.md) and [project map](project-layout.md).

The [admitted-package evidence](../evidence/admitted-acceptance.json) records
the exact candidate and source identities and both host results.
