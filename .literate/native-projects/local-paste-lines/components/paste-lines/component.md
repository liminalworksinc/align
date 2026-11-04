---
namespace: local
version: 1.0.0
display_name: Paste Lines
kind: library
profiles:
  - library
  - portable
  - source-derived
sample: false
provides:
  - name: paste-lines.claude-code-line
    version: 1.0.0
    interface:
      uri: specs/derived/interface-paste-lines-claude-code-line-d8ebe05dc0.md
  - name: paste-lines.codex-line
    version: 1.0.0
    interface:
      uri: specs/derived/interface-paste-lines-codex-line-72b7a78364.md
  - name: paste-lines.safe-mcp-url
    version: 1.0.0
    interface:
      uri: specs/derived/interface-paste-lines-safe-mcp-url-99792e74c3.md
  - name: paste-lines.shq
    version: 1.0.0
    interface:
      uri: specs/derived/interface-paste-lines-shq-8488ee8fff.md
requires: []
specification_provider: openspec
specification_roots:
  - specs/derived/spec.md
authoring_inputs:
  - kind: specification-to-source-skill
    uri: skills/specification-to-source/portable-application-implementation/SKILL.md
    pin: sha256:55dece8843519c6ced884d7cd9eb5d8bff04ebccef055c74c5bfcf176ccd06cd
  - kind: specification-to-source-skill
    uri: skills/specification-to-source/portable-application/SKILL.md
    pin: sha256:79519b3fde095c4189cd95c0e6ff3049a31557c34938ca5df4d0481b64f6e606
  - kind: specification-to-source-skill
    uri: skills/specification-to-source/portable-specification-planning/SKILL.md
    pin: sha256:7bfdd0ddf52d2ddf5d6ac5ed6536b999da474323978937e72f4e4d3b1dface38
workflow_definition:
  uri: workflows/production/staging/dev/workflow.md
  pin: sha256:64424cf72fde2c06f73df88fcba06a00f781a82c4ecdbe22747938412be8ddd8
routing_policy:
  uri: routing/production/staging/dev/routing.json
  pin: sha256:cfd83da047b5ba1534316e856eb74686b90b4a33f803e936e848a1798624f110
flavor_slots:
  - slot_id: build-system
    axis: build.system
    cardinality: zero-or-one
    capability_contract: paste-lines.claude-code-line
  - slot_id: implementation-language-ecosystem
    axis: implementation.language-ecosystem
    cardinality: exactly-one
    capability_contract: paste-lines.claude-code-line
  - slot_id: platform-os
    axis: platform.os
    cardinality: exactly-one
    capability_contract: paste-lines.claude-code-line
entrypoints: []
acceptance_contracts:
  - uri: qualification/profile.json
    pin: sha256:43cb264befb90bdbe74eecead723d34f0dfa9bc8799ad981fb2aa1e6f55b7eeb
source_dependencies: []
---
Source-derived Component. Intent authority is the accepted specification; release implementation authority remains with the recorded source baseline until regenerative qualification passes.
