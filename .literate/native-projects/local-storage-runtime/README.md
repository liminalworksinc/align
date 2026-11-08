# Storage runtime

A bound storage library preserving shared connections, exact statement caching,
atomic callbacks, qualified migrations, live-workspace conditions and audit writes.
Its Node SQLite target keeps the existing thirteen-export database interface.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/storage-runtime/component.md),
[Node target](flavors/node-sqlite-storage/flavor.md), and
[independent acceptance contract](verification/acceptance/storage-runtime.json).

The service uses caller-supplied actual resources. Its qualified schema,
migration-coordinator and wording dependencies remain separate authorities.
See [active work](docs/roadmap/active-work.md) for local readiness.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
