---
schema: "literate-ai/flavor-markdown@1"
namespace: "source-derived"
name: "sqlite-rate-limits"
version: "1.0.0"
display_name: "Source-derived Sqlite-Rate-Limits Flavor"
primary_axis: "toolchain"
target: "sqlite-rate-limits"
secondary_constraints: []
applicable_capabilities:
  - "rate-limits.create-limiter"
provides:
  - name: "flavor.sqlite-rate-limits"
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
# Source-derived Sqlite-Rate-Limits Flavor

This reviewed Flavor captures target-specific policy recovered from the source tree. Its referenced specification is the generation authority.
