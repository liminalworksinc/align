# Goal content limits

Validate and preserve goal content limits through five explicit caller services.
Storage, authentication and version transitions belong to the consuming project.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/goal-limits/component.md),
[Node target](flavors/node-goal-limits/flavor.md),
[independent acceptance](verification/acceptance/goal-limits.json), and
[active work](docs/roadmap/active-work.md).

The dependency-free CommonJS package exports create_goal_limits at
goal_limits/create_goal_limits. Supply badRequest, cleanProse, isBlankText,
rand32 and readDate. The factory returns four constants and cleanText, isDay,
newLimitId, limitsOf and limitsIn. Keep the returned type array live.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
