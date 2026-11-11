---
namespace: local
version: 1.0.0
display_name: Workspace Creation and Public Access
kind: library
profiles:
  - library
  - portable
  - source-derived
sample: false
provides:
  - name: server-workspace-admission.create-access
    version: 1.0.0
    interface:
      uri: specs/derived/interface-server-workspace-admission-create-access-d5ef5e821b.md
  - name: server-workspace-admission.create-creation
    version: 1.0.0
    interface:
      uri: specs/derived/interface-server-workspace-admission-create-creation-9d998eaab7.md
  - name: server-workspace-admission.create-disposable
    version: 1.0.0
    interface:
      uri: specs/derived/interface-server-workspace-admission-create-disposable-7c8a2a20aa.md
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
    capability_contract: server-workspace-admission.create-access
  - slot_id: implementation-language-ecosystem
    axis: implementation.language-ecosystem
    cardinality: exactly-one
    capability_contract: server-workspace-admission.create-access
  - slot_id: platform-os
    axis: platform.os
    cardinality: exactly-one
    capability_contract: server-workspace-admission.create-access
  - slot_id: toolchain
    axis: toolchain
    cardinality: zero-or-one
    capability_contract: server-workspace-admission.create-access
entrypoints: []
acceptance_contracts:
  - uri: qualification/profile.json
    pin: sha256:0d4ddbfc93d8920f5a331a6ca84ab9bd70c648c5644a9923516b3991332e4073
source_dependencies: []
assets:
  - asset_id: disposable-domains
    source: assets/disposable-domains
    path: source/server_workspace_admission/disposable-domains.json
    role: runtime-data
    media_type: application/json
    pin: sha256:1b36130a488aae7a4fefc689f9c9b936dc679a7537edda2c3e1003e53814f894
---
Source-derived Component. Intent authority is the accepted specification; release implementation authority remains with the recorded source baseline until regenerative qualification passes.
