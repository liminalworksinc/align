# Local owner startup

Preserve local first-account creation and sign-in code startup through the
existing caller-owned authentication service and host mechanisms.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-local-owner-bootstrap/component.md),
[Node target](flavors/node-local-owner/flavor.md), and
[independent acceptance](verification/acceptance/server-local-owner-bootstrap.json).

The server_local_owner_bootstrap package exposes create_local_owner_bootstrap
through its named module. Supply all seven declared resources. Its returned
ensureLocalOwner operation has no public arguments and returns Promise<void>.
See [active work](docs/roadmap/active-work.md).
