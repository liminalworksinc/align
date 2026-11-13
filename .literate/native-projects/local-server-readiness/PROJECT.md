# Shared database readiness

This library owns the shared readiness barrier used by Align. Its Component
preserves one cached attempt across callers, ordered opening and migration,
exact rejection identity, failure clearing and retry. The Node target binds
caller-owned state and three existing provider functions.

`create_ready(resources)` returns the detached zero-argument `ready()` operation.
The actual application supplies its existing global state. Database execution,
authentication migrations, schema and request handlers keep their existing owners.
The original behavior allows an old failed attempt to clear a newer cached
attempt; this transfer preserves that overlap and makes no repair claim.

Source snapshot:
`sha256:9b9cc7da46dd9741560acf120d61bd6563c50c70452b3c5c4fdc2ea9f38569e0`.
Two distinct clean generations each pass 40 independent observations. Source
records match on macOS and Linux. The verifier rejects 12 behavior controls and
15 undeclared-resource controls on each host. A separate admitted generation
passes 4 generated checks and ordinary independent acceptance.

Qualification decision: `sha256:d0f4c31b529d53a5af4bc28f5339e1a40364238f1d95dd5a5f09f4663668c4bd`.
See [active work](docs/roadmap/active-work.md) for local readiness. Application
integration and complete parity belong to the consuming project.
