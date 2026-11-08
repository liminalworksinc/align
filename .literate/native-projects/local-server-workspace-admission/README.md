# Workspace creation and public access

Preserve workspace creation and cap checks, public access requests and
disposable-domain decisions through explicit caller-owned services.

Read the [project record](PROJECT.md), [project guide](docs/README.md),
[Component](components/server-workspace-admission/component.md),
[Node target](flavors/node-workspace-admission/flavor.md), and
[independent acceptance](verification/acceptance/server-workspace-admission.json).

The package server_workspace_admission exposes create_creation, create_access
and create_disposable through their named factory modules. Capture exactly the
declared resources, preserve the existing public functions and types, and keep
the full pinned disposable-domains.json beside the advertised modules.
See [active work](docs/roadmap/active-work.md).
