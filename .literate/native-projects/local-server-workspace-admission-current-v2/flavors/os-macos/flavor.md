---
schema: "literate-ai/flavor-markdown@1"
namespace: "literate-ai"
name: "os-macos"
version: "1.0.0"
display_name: "Portable macOS Host"
primary_axis: "platform.os"
target: "macos"
secondary_constraints: []
applicable_capabilities:
  - "server-workspace-admission.create-access"
  - "server-workspace-admission.create-creation"
  - "server-workspace-admission.create-disposable"
provides:
  - name: "platform.os.macos"
    version: "1.0.0"
    contract: null
requires: []
specification_roots:
  - "openspec/spec.md"
authoring_inputs: []
contributions:
  - contribution_id: "macos-standard-command-profile"
    kind: "builder"
    merge_operator: "exact-singleton"
    slot: "standard-platform-command"
    content:
      kind: "standard-command-profile"
      uri: "standard-command-profile.json"
conflicts: []
co_requisites: []
order_before: []
order_after: []
---
# Source-derived Macos Flavor

This reviewed Flavor captures target-specific policy recovered from the source tree. Its referenced specification is the generation authority.
