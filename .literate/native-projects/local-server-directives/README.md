# Session directives and delivery receipts

Write structured session directives and read owned device feeds, ended sessions and delivery receipts.
The consuming application owns persistence, transaction lifecycle, principal and device identity, workspace grants, goal readership, request transitions, events and clocks.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-directives/component.md),
[Node target](flavors/node-server-directives/flavor.md),
[independent acceptance](verification/acceptance/server-directives.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_directives at
server_directives/create_directives. Supply the 21 ordered resources described by the
Node target. Preserve all 10 runtime values and keep the 5 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
