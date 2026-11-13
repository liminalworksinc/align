# Reported goal activity and private work details

Read reported session activity for visible goals and show private work details only to the existing permitted readers.
The consuming application owns persistence, principal and goal visibility, activity evidence classification and clocks.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-goal-activity/component.md),
[Node target](flavors/node-server-goal-activity/flavor.md),
[independent acceptance](verification/acceptance/server-goal-activity.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_goal_activity at
server_goal_activity/create_goal_activity. Supply the 7 ordered resources described by the
Node target. Preserve all 4 runtime values and keep the 2 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
