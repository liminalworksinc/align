# Data retention

Apply the existing data retention schedule and start its recurring server job.
The caller supplies the database, transactions, identity helpers, clock, environment, logging and timers.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-retention/component.md),
[Node target](flavors/node-server-retention/flavor.md),
[independent acceptance](verification/acceptance/server-retention.json), and
[active work](docs/roadmap/active-work.md).

The three-file CommonJS package provides create_retention at
server_retention/create_retention and create_retention_runner at
server_retention/create_retention_runner. Supply seven ordered resources to
the core factory and five to the scheduling factory. Keep RetentionCounts and
Tx at the typed caller boundary. The core returns its 23 existing runtime
members; the scheduler returns an object containing startRetention.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
