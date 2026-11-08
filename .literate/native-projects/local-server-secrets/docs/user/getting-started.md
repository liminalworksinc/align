# Getting started

[Project guide](../README.md) → getting started

This project produces an embedded library for the application's native-library
preparer. It preserves `serverSecret` and `hmac` through the `create_tools`
factory and real caller-owned resources.

## Installation and usage

There is no separate service, public package release or standalone installation.
Parent registration, typed consumers and operator packaging remain with
[parent integration](../roadmap/active-work.md#parent-integration). This child
produces a qualified package and admitted cache for that integration.

The Node target supports Node 24 or newer on macOS and Linux. Its runtime uses
the supplied environment, path, filesystem and cryptographic functions. The
application owns the data directory and configured secret.

Given the `create_tools` export declared by the package's import surface, bind
the real resources documented in `flavors/node-server-secrets/flavor.md` at the
project root. The resulting service
offers `serverSecret(dataDir, env?)` and `hmac(secret, payload)`. Authentication's
separate secret file and caller-owned domain prefixes keep their existing owners.
Runtime files belong to the caller's data directory, and runtime behavior makes
no network requests.

## Contributor workflow

Use the project's pinned runtime and configured coding provider. Inspect the
current authority before changing it:

```console
litai project validate
litai lock components/server-secrets --target server-secrets-host-v1 --check
litai plan components/server-secrets --target server-secrets-host-v1
litai verify
```

After obtaining execution authorization, rebuild and refresh the receipt:

```console
litai rebuild components/server-secrets --target server-secrets-host-v1 --allow-host-execution --update-receipt
litai project test-receipt require-current --project .
```

Rebuild performs ordinary generated and independent acceptance. Cached source
must still pass current acceptance. The independent oracle has 35 original
source cases and one target-binding case. A local cache transfer uses
`litai cache publish --project . --target project-committed` to copy the admitted
entry into the declared portable cache. Keep those cache bytes exact.

Change the Component or Flavor to change behavior. Generated implementation,
locks, qualification records and immutable cache content are derived authority.
See the [framework flow](framework-flow.md) and
[project map](project-layout.md) for ownership.
