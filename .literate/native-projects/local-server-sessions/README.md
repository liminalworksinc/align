# Shared sessions, binding epochs and usage

Share owned sessions, bind work to goals, record usage and manage sharing and agent stops.
The consuming application owns persistence, transaction lifecycle, principals and device identity, workspace permissions, goal policy, request/hold transitions, directives, audit/events, validation and clocks.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-sessions/component.md),
[Node target](flavors/node-server-sessions/flavor.md),
[independent acceptance](verification/acceptance/server-sessions.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_sessions at
server_sessions/create_sessions. Supply the 37 ordered resources described by the
Node target. Preserve all 12 runtime values and keep the 2 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
