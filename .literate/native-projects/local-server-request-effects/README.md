# Request helper effects

Two resource-bound public namespaces preserve existing HTTP responses, origin
checks, credential paths, byte limits, cancellation and provider order.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-request-effects/component.md),
[Node target](flavors/node-server-request-effects/flavor.md) and
[independent acceptance contract](verification/acceptance/server-request-effects.json).

`create_legacy` and `create_v2` capture their explicit providers once without
calling them. The legacy browser check independently reads configuration for
host validation and again for origin validation. Existing refusal messages and
the distinction between absent and empty headers remain part of compatibility.
See [active work](docs/roadmap/active-work.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
