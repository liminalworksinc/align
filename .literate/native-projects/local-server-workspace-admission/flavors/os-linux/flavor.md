---
schema: "literate-ai/flavor-markdown@1"
namespace: "source-derived"
name: "linux"
version: "1.0.0"
display_name: "Source-derived Linux Flavor"
primary_axis: "platform.os"
target: "linux"
secondary_constraints: []
applicable_capabilities:
  - "server-workspace-admission.create-access"
  - "server-workspace-admission.create-creation"
  - "server-workspace-admission.create-disposable"
provides:
  - name: "flavor.linux"
    version: "1.0.0"
    contract: null
requires: []
specification_roots:
  - "openspec/spec.md"
authoring_inputs: []
contributions: []
conflicts:
  - "flavor://source-derived/macos"
co_requisites: []
order_before: []
order_after: []
---
# Source-derived Linux Flavor

This reviewed Flavor captures target-specific policy recovered from the source tree. Its referenced specification is the generation authority.
