# Shared database readiness

A bound library preserving shared promise identity, migration order, failure
clearing and retry through caller-owned state and provider functions.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-readiness/component.md),
[Node target](flavors/node-server-readiness/flavor.md), and
[independent acceptance contract](verification/acceptance/server-readiness.json).

Construction captures resources without invoking them. An existing cached result
is returned exactly. New attempts await authentication preparation before
application migration. See [active work](docs/roadmap/active-work.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
