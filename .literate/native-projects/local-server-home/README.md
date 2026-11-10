# Workspace Home read model

Read the workspace Home sections with the original waiting states, ownership and connected-app metadata.
The consuming application owns principal identity, domain readership, transition rules, configuration, names and live error logging.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-home/component.md),
[Node target](flavors/node-server-home/flavor.md),
[independent acceptance](verification/acceptance/server-home.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_home at
server_home/create_home. Supply the 14 ordered resources described by the
Node target. Preserve all 1 runtime values and keep the 7 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
