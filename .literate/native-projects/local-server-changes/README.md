# Goal change proposals, approval and launch

Propose and review goal changes, keep evidence and conditions, and approve and launch each accepted revision separately.
The consuming application owns persistence, transactions, principals, policy, goal versions, effective consent, visibility, immutable evidence snapshots, link storage, events, identifiers, clocks and validation.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-changes/component.md),
[Node target](flavors/node-server-changes/flavor.md),
[independent acceptance](verification/acceptance/server-changes.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_changes at
server_changes/create_changes. Supply the 44 ordered resources described by the
Node target. Preserve all 17 runtime values and keep the 5 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
