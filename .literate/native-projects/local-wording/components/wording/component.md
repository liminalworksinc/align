---
namespace: local
version: 1.0.0
display_name: Wording
kind: library
profiles:
  - library
  - portable
  - source-derived
sample: false
provides:
  - name: wording.change-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-change-words-9968ff37bc.md
  - name: wording.clean-prose
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-clean-prose-dd9eda5397.md
  - name: wording.count
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-count-e7e3366645.md
  - name: wording.counter-no-change
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-counter-no-change-61d01d79a0.md
  - name: wording.counter-same-as-base
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-counter-same-as-base-c49d50c8c5.md
  - name: wording.counter-same-as-request
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-counter-same-as-request-3b65e9d410.md
  - name: wording.depends-on-full
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-depends-on-full-03d7c1c943.md
  - name: wording.diff-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-diff-words-494b125f32.md
  - name: wording.drop-controls
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-drop-controls-ac4ee7a127.md
  - name: wording.drop-invisible
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-drop-invisible-6401036de8.md
  - name: wording.hidden-goals
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-hidden-goals-260a9d1950.md
  - name: wording.is-blank-text
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-is-blank-text-e79fec2c18.md
  - name: wording.launch-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-launch-words-610fab42ef.md
  - name: wording.plural
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-plural-a084baca60.md
  - name: wording.usd
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-usd-c748bedd89.md
  - name: wording.with-hidden
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-with-hidden-849f81e00c.md
  - name: wording.wording-data
    version: 1.0.0
    interface:
      uri: specs/derived/interface-wording-wording-data-f8c8f74665.md
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
    capability_contract: wording.change-words
  - slot_id: implementation-language-ecosystem
    axis: implementation.language-ecosystem
    cardinality: exactly-one
    capability_contract: wording.change-words
  - slot_id: platform-os
    axis: platform.os
    cardinality: exactly-one
    capability_contract: wording.change-words
entrypoints: []
acceptance_contracts:
  - uri: qualification/profile.json
    pin: sha256:eb1af3bd129efec2f499960d2d74596f2bf22d98278c6e20b789d6566f44fa21
source_dependencies: []
---
Source-derived Component. Intent authority is the accepted specification; release implementation authority remains with the recorded source baseline until regenerative qualification passes.
