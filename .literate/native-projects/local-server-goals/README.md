# Goals and immutable versions

Preserve goal projection, visibility, dependency and target rules, creation capacity and ordered immutable version transitions through caller-supplied services.
The consuming application owns authentication, storage, writer scheduling, permissions and neighbouring service implementations.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-goals/component.md),
[Node target](flavors/node-server-goals/flavor.md),
[independent acceptance](verification/acceptance/server-goals.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_goals at
server_goals/create_goals. Supply the 31 ordered resources described by the
Node target. Preserve all 33 runtime values and keep the 10 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.
