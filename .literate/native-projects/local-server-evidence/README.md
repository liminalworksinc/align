# Evidence links and recorded snapshots

Validate and project advisory evidence links and record the supplied goal facts for a request revision.
The consuming service owns evidence permissions, revision limits, persistence and writer transaction scope.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-evidence/component.md),
[Node target](flavors/node-server-evidence/flavor.md),
[independent acceptance](verification/acceptance/server-evidence.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_evidence at
server_evidence/create_evidence. Supply the 11 ordered resources described by the
Node target. Preserve all 8 runtime values and keep the 5 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.
