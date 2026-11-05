# Public interface: spend-stream.init-codex-state

## ADDED Requirements

### Requirement: spend-stream.init-codex-state

JavaScript module spend_stream/init_codex_state exports init_codex_state(group), taking a string. Return a fresh object with exactly these own properties: {native: null, thread: null, query_source: 'main', auto_review: false, model: null, root_turn: null, has_tur: false, emitted_tc: false, prev_total: null, group}. Preserve group exactly, including the empty string. Do not add cwd, other_cwds or any other property. No side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`
