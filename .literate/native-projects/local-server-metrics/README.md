# Operator metrics

Produce content-free operator reports and record explicitly verified letters of intent.
The caller owns the database, transaction, event recorder, reference grammar, estimate categories and clock.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-metrics/component.md),
[Node target](flavors/node-server-metrics/flavor.md),
[independent acceptance](verification/acceptance/server-metrics.json), and
[active work](docs/roadmap/active-work.md).

The two-file CommonJS package exports create_metrics at
server_metrics/create_metrics. Supply the four ordered resources in the Node
target. Keep the eight public runtime values and three public TypeScript types
at the caller boundary. The library performs its effects through supplied ports.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
