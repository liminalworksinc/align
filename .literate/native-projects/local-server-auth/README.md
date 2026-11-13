# Authentication configuration and sign-in lifecycle

Preserve the existing sign-in configuration, session limits, code admission,
delivery failures, passkey effects, shared instance and authentication migration
behavior through caller-owned providers.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-auth/component.md),
[Node target](flavors/node-server-auth/flavor.md), and
[independent acceptance](verification/acceptance/server-auth.json).

The dependency-free server_auth package exposes create_auth at
server_auth/create_auth. Supply all 52 declared resources. The factory returns
four constants and nine functions with the exact public contracts in the Node
target. Read [active work](docs/roadmap/active-work.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
