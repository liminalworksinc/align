# Workspace and goal spending summaries

Read workspace and goal spending summaries by goal, team, session, model and accounting basis.
The consuming application owns persistence, principals, permission checks, goal visibility and route validation.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-spend/component.md),
[Node target](flavors/node-server-spend/flavor.md),
[independent acceptance](verification/acceptance/server-spend.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_spend at
server_spend/create_spend. Supply the 5 ordered resources described by the
Node target. Preserve all 2 runtime values and keep the 2 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
