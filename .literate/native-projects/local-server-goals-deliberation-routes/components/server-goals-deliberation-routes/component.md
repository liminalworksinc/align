---
namespace: local
version: 1.0.0
display_name: Goals and deliberation HTTP routes
kind: library
profiles:
  - library
  - portable
  - source-derived
sample: false
provides:
  - name: server-goals-deliberation-routes.create-goals-deliberation-routes
    version: 1.0.0
    interface:
      uri: specs/derived/interface-server-goals-deliberation-routes-create-goals-deliberation-routes-c74109ca62.md
requires: []
specification_provider: openspec
specification_roots:
  - specs/derived/spec.md
authoring_inputs:
  - kind: specification-to-source-skill
    uri: skills/specification-to-source/portable-application-implementation/SKILL.md
    pin: sha256:0df5d4b45e8ff6a1e3b670add69e4897fd29bfdcd2e521275d602809e4704f5f
  - kind: specification-to-source-skill
    uri: skills/specification-to-source/portable-application/SKILL.md
    pin: sha256:79519b3fde095c4189cd95c0e6ff3049a31557c34938ca5df4d0481b64f6e606
  - kind: specification-to-source-skill
    uri: skills/specification-to-source/portable-specification-planning/SKILL.md
    pin: sha256:7bfdd0ddf52d2ddf5d6ac5ed6536b999da474323978937e72f4e4d3b1dface38
workflow_definition:
  uri: workflows/production/staging/dev/workflow.md
  pin: sha256:c5c8c2881fd7d5b1504847e93aee5a91015438bbaf867bfb50d5d215e0b0309d
routing_policy:
  uri: routing/production/staging/dev/routing.json
  pin: sha256:99bc0eb9ee3039ccb3836060c199bc94cf1e5aa6c6a92d64235dc6e7065bdb79
flavor_slots:
  - slot_id: build-system
    axis: build.system
    cardinality: zero-or-one
    capability_contract: server-goals-deliberation-routes.create-goals-deliberation-routes
  - slot_id: implementation-language-ecosystem
    axis: implementation.language-ecosystem
    cardinality: exactly-one
    capability_contract: server-goals-deliberation-routes.create-goals-deliberation-routes
  - slot_id: platform-os
    axis: platform.os
    cardinality: exactly-one
    capability_contract: server-goals-deliberation-routes.create-goals-deliberation-routes
  - slot_id: toolchain
    axis: toolchain
    cardinality: zero-or-one
    capability_contract: server-goals-deliberation-routes.create-goals-deliberation-routes
entrypoints: []
acceptance_contracts:
  - uri: qualification/profile.json
    pin: sha256:b51dd1efcc640b8e5651d0f81c8007cacbb7c800aade495d912c21b9bcbc8dd1
source_dependencies: []
---
Source-derived Component. Intent authority is the accepted specification; release implementation authority remains with the recorded source baseline until regenerative qualification passes.
