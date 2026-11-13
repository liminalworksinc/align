# Client keys

Normalize supplied client-address text and select hosted or local request keys
while preserving the existing IPv4-mapped, IPv6 grouping and loose-input behavior.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-client-keys/component.md),
[Node target](flavors/node-server-client-keys/flavor.md) and
[independent acceptance contract](verification/acceptance/server-client-keys.json).

`create_client_keys` captures the configuration provider once. Its detached
`clientNet` and `clientOf` methods preserve fresh mode reads, header absence versus
empty values, method receivers and exact failures. The capability
`server-client-keys.create-client-keys` maps to that exact module and factory.
See [active work](docs/roadmap/active-work.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
