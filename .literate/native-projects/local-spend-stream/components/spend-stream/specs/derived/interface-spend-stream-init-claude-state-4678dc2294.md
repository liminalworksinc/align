# Public interface: spend-stream.init-claude-state

## ADDED Requirements

### Requirement: spend-stream.init-claude-state

JavaScript module spend_stream/init_claude_state exports init_claude_state(file), taking any string representing a native-host path. The host path conventions come from the selected platform Flavor. Split file on the host path separator; let i be the last exact subagents segment. If i > 0 return exactly {session_id: parts[i-1], prompt_id: null, subagent: true, cwd: null}. Otherwise return exactly {session_id: the host basename of file with the exact suffix .jsonl removed according to Node path.basename(file, '.jsonl'), prompt_id: null, subagent: false, cwd: null}. The basename operation handles empty strings and trailing separators; a basename exactly .jsonl remains .jsonl. Do not add other_cwds or any other property. Return a fresh object on each call. No filesystem access or other side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`
