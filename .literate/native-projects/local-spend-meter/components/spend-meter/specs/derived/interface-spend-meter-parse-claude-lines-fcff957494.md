# Public interface: spend-meter.parse-claude-lines

## ADDED Requirements

### Requirement: spend-meter.parse-claude-lines

JavaScript module spend_meter/parse_claude_lines. It exports one function, parse_claude_lines(file, lines), that reads the lines of one Claude Code transcript file in order and returns the usage events they describe, as one array.

file is the transcript's path; lines is an array of strings (one JSON object per line). The helper count(v) used below: when v is undefined or null it gives null (absent). When v is a string made only of one or more ASCII digits 0-9 it is first converted with Number(v). The result (or v itself when it was not such a string) is accepted only if it is a JavaScript number that Number.isSafeInteger accepts, is >= 0 and is <= 1000000000000; then count gives that number. Any other value (a negative number, a fraction, a boolean, an object, a string with any non-digit character, a number above 1000000000000) gives NaN (present but invalid). The helper iso(v): when v is not a string, or is the empty string, it gives null; otherwise t = Date.parse(v) (the ECMAScript built-in), and if t is finite it gives new Date(t).toISOString(), else null.

State, set up from file before the first line: split file on /. If the last occurrence of the segment subagents is at index i > 0, the file is a subagent transcript: session_id = the segment at i-1, subagent = true. Otherwise session_id = the last segment with a trailing .jsonl removed if present (unless the segment is exactly .jsonl, which is kept whole), subagent = false. Paths ending in / are out of scope. Also prompt_id = null, cwd = null, other_cwds = [] (at most 8 entries).

For each line, in order, append the events below (an empty line or a line of only whitespace gives none):
1. If (cwd is set or subagent) and the line contains neither the text "usage" nor the text "promptId" (with the double quotes), the line gives no events and is not parsed.
2. Parse the line with JSON.parse. If it throws, or the value is null or not an object (arrays count as objects), give exactly [{kind: gap, reason: malformed_line}] for this line.
3. If not subagent: if row.sessionId is a non-empty string, session_id = it. If row.cwd is a non-empty string c: when cwd is unset, cwd = c and, if session_id is set, give {kind: session, harness: claude-code, native_session_id: session_id, cwd: c, ts: iso(row.timestamp)}; otherwise when c differs from cwd, is not already in other_cwds and other_cwds has fewer than 8 entries, append c to other_cwds and, if session_id is set, give the same session event with cwd c.
4. If session_id is not set, stop for this line.
5. If row.type is user: if row.promptId is a non-empty string p, and not subagent, and p differs from prompt_id, and row.isSidechain is not exactly true: prompt_id = p, and if iso(row.timestamp) is not null give {kind: root_turn, harness: claude-code, native_session_id: session_id, root_turn: p, ts: that iso}. Stop for this line.
6. If row.type is not assistant, stop. Let m = row.message when it is a non-null object, else stop. If m.usage is falsy, stop. model = m.model when a non-empty string; if missing or exactly <synthetic>, stop.
7. provider_id = row.requestId if a non-empty string, else row.request_id if a non-empty string, else msg: followed by m.id if m.id is a non-empty string, else uuid: followed by row.uuid if a non-empty string. If none, give {kind: gap, reason: unkeyed_request} and stop.
8. is_sub = subagent or row.isSidechain is exactly true. Give {kind: request, harness: claude-code, provider: anthropic, provider_id, native_session_id: session_id, ts: iso(row.timestamp), model, query_source: subagent if is_sub else main, counts: claude_counts(m.usage) (the spend-meter.claude-counts rule, an object or null), finalized: true exactly when m.stop_reason is a non-empty string, root_turn: (row.promptId if it is a non-empty string, else null) when is_sub, otherwise prompt_id (which may be null), source: transcript}.
Events are plain objects with exactly the keys listed. It has no side effects beyond its own local state, which does not survive the call.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`, `evidence:e6ef2013d0e75c4a9803`
