# Device pairing and credentials

Pair devices with key-bound approvals, rotate credentials and manage device workspace grants.
The consuming application owns persistence, transaction lifecycle, identity, memberships, workspace grants, session ending, audit/events, cryptographic primitives, limits and clocks.

Read the [project record](PROJECT.md), [guide](docs/README.md),
[Component](components/server-devices/component.md),
[Node target](flavors/node-server-devices/flavor.md),
[independent acceptance](verification/acceptance/server-devices.json), and
[active work](docs/roadmap/active-work.md).

The two-file dependency-free CommonJS package exports create_devices at
server_devices/create_devices. Supply the 24 ordered resources described by the
Node target. Preserve all 30 runtime values and keep the 2 original
public TypeScript types at the caller. Root build/test adapters stay outside the
runtime package. Native output has no ambient application effects.

<!-- literate-ai:parent-repositories -->
- Parent repository: [github.com/jordanhubbard/literate-ai](<https://github.com/jordanhubbard/literate-ai>)
<!-- /literate-ai:parent-repositories -->
