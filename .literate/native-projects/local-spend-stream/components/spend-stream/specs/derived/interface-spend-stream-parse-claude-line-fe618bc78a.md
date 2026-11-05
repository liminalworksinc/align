# Public interface: spend-stream.parse-claude-line

## ADDED Requirements

### Requirement: spend-stream.parse-claude-line

JavaScript module spend_stream/parse_claude_line exports parse_claude_line(line, state). line is a string; state is a mutable object from init_claude_state or a JSON-restored state from previous calls. Return the event array and mutate that same state object in place. Field names below refer to state properties. Fields not explicitly assigned remain unchanged, including unknown extra fields. An absent other_cwds is read as an empty array and is created only when a new non-primary folder is appended. Recording another folder does not change the primary cwd.

The count helper returns null for undefined or null. A string consisting only of one or more ASCII digits is converted with Number first. A JavaScript number is returned unchanged exactly when Number.isSafeInteger accepts it and it is between 0 and 1000000000000 inclusive; every other value gives NaN. Negative zero remains negative zero. The iso helper returns null unless its argument is a non-empty string; for such a string it uses ECMAScript Date.parse, returning new Date(t).toISOString() when t is finite, otherwise null. No counter coercion other than that digit-string conversion is allowed.

For the single line, return the events below (an empty line or a line of only whitespace gives none):
1. If (cwd is set or subagent) and the line contains neither the text "usage" nor the text "promptId" (with the double quotes), the line gives no events and is not parsed.
2. Parse the line with JSON.parse. If it throws, or the value is null or not an object (arrays count as objects), give exactly [{kind: gap, reason: malformed_line}] for this line.
3. If not subagent: if row.sessionId is a non-empty string, session_id = it. If row.cwd is a non-empty string c: when cwd is unset, cwd = c and, if session_id is set, give {kind: session, harness: claude-code, native_session_id: session_id, cwd: c, ts: iso(row.timestamp)}; otherwise when c differs from cwd, is not already in other_cwds and other_cwds has fewer than 8 entries, append c to other_cwds and, if session_id is set, give the same session event with cwd c.
4. If session_id is not set, stop for this line.
5. If row.type is user: if row.promptId is a non-empty string p, and not subagent, and p differs from prompt_id, and row.isSidechain is not exactly true: prompt_id = p, and if iso(row.timestamp) is not null give {kind: root_turn, harness: claude-code, native_session_id: session_id, root_turn: p, ts: that iso}. Stop for this line.
6. If row.type is not assistant, stop. Let m = row.message when it is a non-null object, else stop. If m.usage is falsy, stop. model = m.model when a non-empty string; if missing or exactly <synthetic>, stop.
7. provider_id = row.requestId if a non-empty string, else row.request_id if a non-empty string, else msg: followed by m.id if m.id is a non-empty string, else uuid: followed by row.uuid if a non-empty string. If none, give {kind: gap, reason: unkeyed_request} and stop.
8. is_sub = subagent or row.isSidechain is exactly true. Give {kind: request, harness: claude-code, provider: anthropic, provider_id, native_session_id: session_id, ts: iso(row.timestamp), model, query_source: subagent if is_sub else main, counts: claude_counts(m.usage) (the private normalization rule below, an object or null), finalized: true exactly when m.stop_reason is a non-empty string, root_turn: (row.promptId if it is a non-empty string, else null) when is_sub, otherwise prompt_id (which may be null), source: transcript}.
Events are plain objects with exactly the keys listed. Only the caller's state object is mutated. All state survives there for the next call; there is no hidden process-global parser state.

Private message-usage normalization:
A counts object has exactly six integer fields: input (fresh input tokens, excluding cache reads and writes), output, cache_read, cache_write_5m, cache_write_1h and cache_write_unsplit. The helper count(v) used below: when v is undefined or null it gives null (absent). When v is a string made only of one or more ASCII digits 0-9 it is first converted with Number(v). The result (or v itself when it was not such a string) is accepted only if it is a JavaScript number that Number.isSafeInteger accepts, is >= 0 and is <= 1000000000000; then count gives that number. Any other value (a negative number, a fraction, a boolean, an object, a string with any non-digit character, a number above 1000000000000) gives NaN (present but invalid).

claude_counts(usage): if usage is not a non-null object, return null. input = count(usage.input_tokens), output = count(usage.output_tokens); if either is null or NaN return null. cache_read = count(usage.cache_read_input_tokens), with null replaced by 0 (NaN stays NaN). total = count(usage.cache_creation_input_tokens). Let w5 = w1 = unsplit = 0. If usage.cache_creation is a non-null object d: w5 = count(d.ephemeral_5m_input_tokens) with null replaced by 0, w1 = count(d.ephemeral_1h_input_tokens) with null replaced by 0; then if total is not null: if total is NaN return null; if w5 + w1 > total return null; unsplit = total - (w5 + w1). Otherwise (no cache_creation object) if total is not null, unsplit = total. The result is {input, output, cache_read, cache_write_5m: w5, cache_write_1h: w1, cache_write_unsplit: unsplit}, returned only if every one of its six values is a safe integer >= 0; otherwise null (so any NaN gives null). It has no side effects.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`
