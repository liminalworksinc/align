# Goal approval and launch sets

Compute goal consent and launch membership from current storage through one
caller-supplied query service. This library records no decision or launch.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/goal-approval/component.md),
[Node target](flavors/node-goal-approval/flavor.md),
[independent acceptance](verification/acceptance/goal-approval.json), and
[active work](docs/roadmap/active-work.md).

The dependency-free CommonJS package exports create_approval at
goal_approval/create_approval. Supply all. The factory returns synchronous
approvalSet, effectiveSet and launchSet operations with arities one, two and two.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
