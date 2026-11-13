# Server startup

A bound library preserving the existing startup operation, PID-file behavior,
leftover cleanup, warning delivery and exit cleanup through caller-owned resources.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-startup/component.md),
[Node target](flavors/node-server-startup/flavor.md), and
[independent acceptance contract](verification/acceptance/server-startup.json).

Construction captures resource functions without invoking them. Startup reads
current values. See [active work](docs/roadmap/active-work.md) for local readiness
and parent ownership.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
