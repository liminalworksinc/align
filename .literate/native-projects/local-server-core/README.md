# Server core and events

Preserve workspace, user, session, secret, event and effect operations through
explicit caller-owned providers and current host-service resolvers.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-core/component.md),
[Node target](flavors/node-server-core/flavor.md) and
[independent acceptance contract](verification/acceptance/server-core.json).

`server-core.create-core` maps to `server_core/create_core` and its named
`create_core` factory. `server-core.create-events` maps to
`server_core/create_events` and its named `create_events` factory. Construction
captures declared ports without invoking them. Returned operations preserve exact
SQL, mutable tables and references, transaction callback results, effect order,
message coercion and failures. The consuming module retains its public types.
See [active work](docs/roadmap/active-work.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
