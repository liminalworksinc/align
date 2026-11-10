# Shared work signals and visible activity

Record a device's shared-session work signals and read the visible workspace activity feed.
The consuming application owns database transactions, device and principal identity, goal readership, text cleaning, retention names and the live clock.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-activity/component.md),
[Node target](flavors/node-server-activity/flavor.md),
[independent acceptance](verification/acceptance/server-activity.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_activity at
server_activity/create_activity. Supply the 16 ordered resources described by the
Node target. Preserve all 2 runtime values and keep the 0 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
