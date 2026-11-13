# Team asks and mention history

Record team asks, retain their mentions and decisions, and expose only the original permitted web and device views.
The consuming application owns database transactions, policy, identity, clock, events, validation, team membership and goal visibility.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-asks/component.md),
[Node target](flavors/node-server-asks/flavor.md),
[independent acceptance](verification/acceptance/server-asks.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_asks at
server_asks/create_asks. Supply the 23 ordered resources described by the
Node target. Preserve all 22 runtime values and keep the 4 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
