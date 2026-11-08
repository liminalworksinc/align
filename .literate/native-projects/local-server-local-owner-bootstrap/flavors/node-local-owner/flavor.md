---
schema: "literate-ai/flavor-markdown@1"
namespace: "source-derived"
name: "node-local-owner"
version: "1.0.0"
display_name: "Source-derived Node-Local-Owner Flavor"
primary_axis: "toolchain"
target: "node-local-owner"
secondary_constraints: []
applicable_capabilities:
  - "server-local-owner-bootstrap.create-local-owner-bootstrap"
provides:
  - name: "flavor.node-local-owner"
    version: "1.0.0"
    contract: null
requires: []
specification_roots:
  - "openspec/spec.md"
authoring_inputs: []
contributions: []
conflicts: []
co_requisites: []
order_before: []
order_after: []
---
# Source-derived Node-Local-Owner Flavor

This reviewed Flavor captures target-specific policy recovered from the source tree. Its referenced specification is the generation authority.
