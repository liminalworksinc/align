# Target reallocation proposals

Propose, approve, counter and separately launch target-share changes for several goals through explicit consuming-service resources.
The consuming application owns database transactions, policy, identity, clock, validation, goal versions and related service effects.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-reallocations/component.md),
[Node target](flavors/node-server-reallocations/flavor.md),
[independent acceptance](verification/acceptance/server-reallocations.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_reallocations at
server_reallocations/create_reallocations. Supply the 26 ordered resources described by the
Node target. Preserve all 9 runtime values and keep the 3 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
