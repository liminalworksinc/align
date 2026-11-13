# Workspace steering event handling

Read workspace steering settings, change them with owner approval, and ingest and count permitted session steering events.
The consuming application owns principal identity, workspace and session isolation, SQLite transactions, audit storage, validation, regular expressions and live clock resources.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-steering/component.md),
[Node target](flavors/node-server-steering/flavor.md),
[independent acceptance](verification/acceptance/server-steering.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_steering at
server_steering/create_steering. Supply the 11 ordered resources described by the
Node target. Preserve all 4 runtime values and keep the 1 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
