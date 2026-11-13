# Server secret helpers

A bound library preserving configured secret selection, persisted cryptographic
entropy, filesystem behavior and HMAC-SHA256 outputs through the existing two
helper APIs.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-secrets/component.md),
[Node target](flavors/node-server-secrets/flavor.md), and
[independent acceptance contract](verification/acceptance/server-secrets.json).

The service captures real host resources without invoking them at construction.
Current environment selection stays dynamic. See
[active work](docs/roadmap/active-work.md) for local readiness and parent ownership.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
