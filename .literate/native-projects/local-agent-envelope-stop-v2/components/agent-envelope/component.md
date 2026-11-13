---
namespace: local
version: 1.0.0
display_name: Agent Envelope
kind: library
profiles:
  - library
  - portable
  - source-derived
sample: false
provides:
  - name: agent-envelope.asks-block
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-asks-block-989a2875b8.md
  - name: agent-envelope.bound-context-note
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-bound-context-note-698a0e8088.md
  - name: agent-envelope.bound-limits
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-bound-limits-73f949d43b.md
  - name: agent-envelope.clean
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-clean-7f4daed27d.md
  - name: agent-envelope.collision-reason
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-collision-reason-d26fce6cbd.md
  - name: agent-envelope.collisions-reason
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-collisions-reason-557c2cd03f.md
  - name: agent-envelope.cross-note
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-cross-note-6dbc90fbd4.md
  - name: agent-envelope.end-sentence
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-end-sentence-d04da24917.md
  - name: agent-envelope.ended-data
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-ended-data-cee7e9483e.md
  - name: agent-envelope.ended-why-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-ended-why-words-5443ccc6f4.md
  - name: agent-envelope.envelope-data
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-envelope-data-916a8add52.md
  - name: agent-envelope.expired-why
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-expired-why-4a19e0f508.md
  - name: agent-envelope.goal-mark
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-goal-mark-f00d8949a7.md
  - name: agent-envelope.hold-reason
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-hold-reason-b84997b4c4.md
  - name: agent-envelope.kept-holds-note
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-kept-holds-note-2803225d5d.md
  - name: agent-envelope.latch-notice-tail
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-latch-notice-tail-05b644dbb8.md
  - name: agent-envelope.latch-way-out
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-latch-way-out-295aba13b4.md
  - name: agent-envelope.limit-change
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-limit-change-a8ba205499.md
  - name: agent-envelope.limits-seen
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-limits-seen-d1030808b3.md
  - name: agent-envelope.measure-key
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-measure-key-a778bb30b0.md
  - name: agent-envelope.never-sent-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-never-sent-words-46e7703def.md
  - name: agent-envelope.none-told
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-none-told-0be93df95b.md
  - name: agent-envelope.other-workspace-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-other-workspace-words-df0d1ef404.md
  - name: agent-envelope.out-of-reach-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-out-of-reach-words-89658f35e6.md
  - name: agent-envelope.person-name
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-person-name-53e0149339.md
  - name: agent-envelope.quoted
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-quoted-7c1b190827.md
  - name: agent-envelope.release-notice
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-release-notice-c8f9f9a987.md
  - name: agent-envelope.remote-path
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-remote-path-04f4dd6f88.md
  - name: agent-envelope.render-asks-delta
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-render-asks-delta-24de60bf0b.md
  - name: agent-envelope.render-asks-gone
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-render-asks-gone-b0b39b5be5.md
  - name: agent-envelope.render-card
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-render-card-78f423892a.md
  - name: agent-envelope.render-context-delta
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-render-context-delta-74c0448c6d.md
  - name: agent-envelope.render-delta
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-render-delta-ca23578ebe.md
  - name: agent-envelope.render-envelope
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-render-envelope-e799a8a3dd.md
  - name: agent-envelope.render-followed-asks-ended
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-render-followed-asks-ended-eb3b8685db.md
  - name: agent-envelope.request-answer-line
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-request-answer-line-f66fd367c7.md
  - name: agent-envelope.request-context
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-request-context-d2bcaac49b.md
  - name: agent-envelope.request-notice
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-request-notice-6e781e2ea7.md
  - name: agent-envelope.request-short-id
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-request-short-id-5cf35f01d0.md
  - name: agent-envelope.request-what
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-request-what-18303a8ae9.md
  - name: agent-envelope.request-withdrawn-notice
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-request-withdrawn-notice-8cdb97dd86.md
  - name: agent-envelope.senders-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-senders-words-a07ba25ab6.md
  - name: agent-envelope.share-again-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-share-again-words-4071590b4b.md
  - name: agent-envelope.share-notice
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-share-notice-273e9a1ea7.md
  - name: agent-envelope.share-retell
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-share-retell-5966d7b2f6.md
  - name: agent-envelope.short-id
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-short-id-c27343ac8b.md
  - name: agent-envelope.sibling-change-note
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-sibling-change-note-a580d45a54.md
  - name: agent-envelope.state-situation
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-state-situation-95856b1a3a.md
  - name: agent-envelope.stopped-for-good-words
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-stopped-for-good-words-b646aa85ac.md
  - name: agent-envelope.stored-text
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-stored-text-7f529c7aed.md
  - name: agent-envelope.told-situation
    version: 1.0.0
    interface:
      uri: specs/derived/interface-agent-envelope-told-situation-6d7431d1d9.md
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
    capability_contract: agent-envelope.asks-block
  - slot_id: implementation-language-ecosystem
    axis: implementation.language-ecosystem
    cardinality: exactly-one
    capability_contract: agent-envelope.asks-block
  - slot_id: platform-os
    axis: platform.os
    cardinality: exactly-one
    capability_contract: agent-envelope.asks-block
entrypoints: []
acceptance_contracts:
  - uri: qualification/profile.json
    pin: sha256:cda578dd61e86bda25a2922e8a7e988d5b57f9e64fc80e610dc7d8a1eecfc8c1
source_dependencies: []
---
Source-derived Component. Intent authority is the accepted specification; release implementation authority remains with the recorded source baseline until regenerative qualification passes.
