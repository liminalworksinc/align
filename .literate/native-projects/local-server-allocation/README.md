# Allocation shares, targets and weekly gaps

Report shared workspace agent time against goal targets with the original private and unallocated totals.
The consuming application owns persistence, principal and goal visibility, permission checks and the live Date resource.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-allocation/component.md),
[Node target](flavors/node-server-allocation/flavor.md),
[independent acceptance](verification/acceptance/server-allocation.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_allocation at
server_allocation/create_allocation. Supply the 6 ordered resources described by the
Node target. Preserve all 4 runtime values and keep the 2 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
