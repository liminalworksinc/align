# Decision value cards and reports

Project approved-request value cards and record a person's report through26
explicit caller resources. The consuming application owns authentication,
authorization decisions, storage, transactions, app facts and caller types.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-value/component.md),
[Node target](flavors/node-server-value/flavor.md),
[independent acceptance](verification/acceptance/server-value.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_value at
server_value/create_value. It returns valueView, VALUE_ACTIONS and recordValue.
Both public entrypoints take the principal, goal identifier, then request
identifier. recordValue takes the body fourth. Keep the action array live.
The caller retains Estimate, ValueReport, ValueView and six original re-exports.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
