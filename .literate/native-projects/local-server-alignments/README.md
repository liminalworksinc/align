# Goal contribution and session alignment

Request, counter, approve and revoke contributions and the goals that shared sessions follow.
The consuming application owns persistence, transactions, principals, policy, goal loading, consent, session epochs, directives, holds, identifiers, audit and validators.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-alignments/component.md),
[Node target](flavors/node-server-alignments/flavor.md),
[independent acceptance](verification/acceptance/server-alignments.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_alignments at
server_alignments/create_alignments. Supply the 32 ordered resources described by the
Node target. Preserve all 8 runtime values and keep the 4 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
