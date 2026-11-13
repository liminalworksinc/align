# Limit suggestions

Suggest goal limits from notes using plain sentence rules and fourteen supplied
services. Suggestions are returned without storing or approving them.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/limit-suggest/component.md),
[Node target](flavors/node-limit-suggest/flavor.md),
[independent acceptance](verification/acceptance/limit-suggest.json), and
[active work](docs/roadmap/active-work.md).

The dependency-free CommonJS package exports create_suggestions at
limit_suggest/create_suggestions. Supply the fourteen resources in the Node
target. The factory returns NOTES_MAX and six functions. Storage, authentication,
goal visibility, quotas and accepted changes remain consuming services.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
