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
  - "agent-envelope.asks-block"
  - "agent-envelope.bound-context-note"
  - "agent-envelope.bound-limits"
  - "agent-envelope.clean"
  - "agent-envelope.collision-reason"
  - "agent-envelope.collisions-reason"
  - "agent-envelope.cross-note"
  - "agent-envelope.end-sentence"
  - "agent-envelope.ended-data"
  - "agent-envelope.ended-why-words"
  - "agent-envelope.envelope-data"
  - "agent-envelope.expired-why"
  - "agent-envelope.goal-mark"
  - "agent-envelope.hold-reason"
  - "agent-envelope.kept-holds-note"
  - "agent-envelope.latch-notice-tail"
  - "agent-envelope.latch-way-out"
  - "agent-envelope.limit-change"
  - "agent-envelope.limits-seen"
  - "agent-envelope.measure-key"
  - "agent-envelope.never-sent-words"
  - "agent-envelope.none-told"
  - "agent-envelope.other-workspace-words"
  - "agent-envelope.out-of-reach-words"
  - "agent-envelope.person-name"
  - "agent-envelope.quoted"
  - "agent-envelope.release-notice"
  - "agent-envelope.remote-path"
  - "agent-envelope.render-asks-delta"
  - "agent-envelope.render-asks-gone"
  - "agent-envelope.render-card"
  - "agent-envelope.render-context-delta"
  - "agent-envelope.render-delta"
  - "agent-envelope.render-envelope"
  - "agent-envelope.render-followed-asks-ended"
  - "agent-envelope.request-answer-line"
  - "agent-envelope.request-context"
  - "agent-envelope.request-notice"
  - "agent-envelope.request-short-id"
  - "agent-envelope.request-what"
  - "agent-envelope.request-withdrawn-notice"
  - "agent-envelope.senders-words"
  - "agent-envelope.share-again-words"
  - "agent-envelope.share-notice"
  - "agent-envelope.share-retell"
  - "agent-envelope.short-id"
  - "agent-envelope.sibling-change-note"
  - "agent-envelope.state-situation"
  - "agent-envelope.stopped-for-good-words"
  - "agent-envelope.stored-text"
  - "agent-envelope.told-situation"
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
# Portable macOS Host

Select this Flavor when the `platform.os` axis should resolve to `macos`. The referenced
specification contains the exact generation policy contributed by this choice.
Remote-worker host configuration also attempts NTP synchronization to `time.nist.gov`;
failure is logged in bootstrap evidence and does not fail sample-worker readiness.
