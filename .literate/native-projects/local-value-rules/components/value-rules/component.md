---
namespace: local
version: 1.0.0
display_name: Value Rules
kind: library
profiles:
  - library
  - portable
  - source-derived
sample: false
provides:
  - name: value.clean-value-text
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-clean-value-text-c7b8f09041.md
  - name: value.estimate-said
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-estimate-said-93505077ac.md
  - name: value.follow-up-problem
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-follow-up-problem-9cd178d1f6.md
  - name: value.follow-up-url
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-follow-up-url-00b0c816cf.md
  - name: value.loi-url-ok
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-loi-url-ok-d10c45cb1d.md
  - name: value.safe-follow-up-url
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-safe-follow-up-url-04a6a652ff.md
  - name: value.span-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-span-words-e04c7bb8b5.md
  - name: value.value-data
    version: 1.0.0
    interface:
      uri: specs/derived/interface-value-value-data-e3d799dd42.md
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
    capability_contract: value.clean-value-text
  - slot_id: implementation-language-ecosystem
    axis: implementation.language-ecosystem
    cardinality: exactly-one
    capability_contract: value.clean-value-text
  - slot_id: platform-os
    axis: platform.os
    cardinality: exactly-one
    capability_contract: value.clean-value-text
entrypoints: []
acceptance_contracts:
  - uri: qualification/profile.json
    pin: sha256:efa991cd66cb887b07ccf56bcc5108eb5609a6f831ed1ad452b2fe4cb28866b0
source_dependencies: []
---
Source-derived Component. Intent authority is the accepted specification; release implementation authority remains with the recorded source baseline until regenerative qualification passes.
