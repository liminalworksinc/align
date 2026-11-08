# Account and membership lifecycle

Preserve passkey management, account deletion, session revocation and membership
cleanup through explicit caller-owned services and transactional SQL bindings.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-account-lifecycle/component.md),
[Node target](flavors/node-account-lifecycle/flavor.md) and
[independent acceptance](verification/acceptance/server-account-lifecycle.json).

`server-account-lifecycle.create-account` maps to
`server_account_lifecycle/create_account` and its `create_account` factory.
`server-account-lifecycle.create-lifecycle` maps to
`server_account_lifecycle/create_lifecycle` and its `create_lifecycle` factory.
Factories capture exactly the declared resources. Operations retain public
return values, SQL transaction rollback and the original supplied error objects.
See [active work](docs/roadmap/active-work.md).

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
