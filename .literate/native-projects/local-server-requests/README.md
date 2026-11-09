# Typed agent requests and goal holds

Send typed replan, checkpoint and switch-goal requests, retain each session answer, and hold or release the sessions that follow a goal.
The consuming application owns database transactions, policy, identity, clock, directives, events, binding changes and route-level receipt validation.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-requests/component.md),
[Node target](flavors/node-server-requests/flavor.md),
[independent acceptance](verification/acceptance/server-requests.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_requests at
server_requests/create_requests. Supply the 29 ordered resources described by the
Node target. Preserve all 20 runtime values and keep the 7 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
