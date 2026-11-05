# Public interface: spend-meter.parse-codex-lines

## ADDED Requirements

### Requirement: spend-meter.parse-codex-lines

JavaScript module spend_meter/parse_codex_lines. It exports one function, parse_codex_lines(group, lines), that reads the lines of one Codex rollout file in order and returns the usage events they describe, as one array.

group is a string naming this file's retractable rows; lines is an array of strings. The helper count(v) used below: when v is undefined or null it gives null (absent). When v is a string made only of one or more ASCII digits 0-9 it is first converted with Number(v). The result (or v itself when it was not such a string) is accepted only if it is a JavaScript number that Number.isSafeInteger accepts, is >= 0 and is <= 1000000000000; then count gives that number. Any other value (a negative number, a fraction, a boolean, an object, a string with any non-digit character, a number above 1000000000000) gives NaN (present but invalid). The helper iso(v): when v is not a string, or is the empty string, it gives null; otherwise t = Date.parse(v) (the ECMAScript built-in), and if t is finite it gives new Date(t).toISOString(), else null. str(v) means v when v is a non-empty string, else null.

totals(u): if u is not a non-null object, null. Otherwise input = count(u.input_tokens if that is neither null nor undefined, else u.prompt_tokens); cached = count(the first of u.cached_input_tokens, u.cache_read_input_tokens, u.cached_tokens that is neither null nor undefined), with null replaced by 0; cache_write = count(u.cache_write_input_tokens) with null replaced by 0; output = count(u.output_tokens if neither null nor undefined, else u.completion_tokens). If input or output is null, null. If any of the four is not a safe integer (NaN), null. Else {input, cached, cache_write, output}.
codex_counts(t): null if t is null; fresh = t.input - t.cached - t.cache_write; null if fresh < 0; else {input: fresh, output: t.output, cache_read: t.cached, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: t.cache_write}.

State before the first line: native = null, thread = null, query_source = main, auto_review = false, model = null, root_turn = null, has_tur = false, emitted_tc = false, prev_total = null, cwd = null, other_cwds = [] (at most 8).

A request event built by usage(provider_id, ts, t, root, grp, model_override) is {kind: request, harness: codex, provider: openai, provider_id, native_session_id: native, ts, model: codex-auto-review when auto_review, else model_override if non-empty, else state model if set, else unknown, query_source, counts: codex_counts(t), total_input: t.input (the key is omitted entirely when t is null), finalized: true, root_turn: root, source: rollout, retract_group: grp}.

For each line, in order (an empty or whitespace-only line gives nothing):
1. If the line contains none of the texts session_meta, turn_context, token_usage_record, token_count, task_started, it gives nothing and is not parsed.
2. JSON.parse it; if that throws or the value is null or not an object, give [{kind: gap, reason: malformed_line}] for this line. payload = rec.payload when a non-null object, else {}. ts = iso(rec.timestamp).
3. rec.type session_meta: thread = str(payload.id); sid = str(payload.session_id); parent = str(payload.parent_thread_id); native = sid when sid is set and (sid differs from thread or parent is null), else parent if set, else sid if set, else thread. Classification: ts_src = str(payload.thread_source); sub = payload.source.subagent when payload.source is a non-null object, else null. If ts_src is guardian_review, or sub is a non-null object whose other is exactly guardian: query_source = auxiliary, auto_review = true. Else if ts_src is subagent, or sub is a non-null object, or parent is set: query_source = subagent, auto_review = false. Else main, false. If str(payload.model) is set, model = it. If native is set and query_source is main, give {kind: session, harness: codex, native_session_id: native, cwd: str(payload.cwd), ts}. Then cwd = str(payload.cwd).
4. rec.type turn_context: if str(payload.model) is set, model = it. c = str(payload.cwd); if c is set and native is set and query_source is main and cwd is set and c differs from cwd and c is not in other_cwds and other_cwds has fewer than 8 entries: append c and give {kind: session, harness: codex, native_session_id: native, cwd: c, ts}. Then root_turn = str(payload.root_turn_id), else str(payload.turn_id), else unchanged.
5. rec.type token_usage_record: if native is null give exactly [{kind: gap, reason: no_session_meta}]. Else, if has_tur is false: has_tur = true, and if emitted_tc give {kind: retract, group}. rid = str(payload.response_id); if null also give {kind: gap, reason: unkeyed_request} and stop. Else give usage(resp: followed by rid, ts, totals(payload.usage), str(payload.root_turn_id) or else root_turn, null, str(payload.model)).
6. rec.type event_msg with payload.type task_started: turn = str(payload.turn_id); root = str(payload.root_turn_id) or else turn; if root is set, root_turn = root; if native is set and query_source is main and turn is set and root equals turn and ts is not null, give {kind: root_turn, harness: codex, native_session_id: native, root_turn: turn, ts}.
7. rec.type event_msg with payload.type token_count: nothing if has_tur or native is null. info = payload.info when a non-null object, else nothing. total = totals(info.total_token_usage); last = totals(info.last_token_usage); counted = last. If total is set: with prev = prev_total, if prev is set and all four fields of total equal prev's, give nothing (a repeat). If prev is set and any field of total is less than prev's, prev_total = total and give exactly [{kind: gap, reason: cumulative_regression}] for this line. If counted is null, counted = total minus prev field by field when prev is set, else total. prev_total = total. If counted is null, or counted.input and counted.output are both 0, give nothing. key = tc:{thread}:{total.input}:{total.cached}:{total.output} when total is set, else tc:{thread}:{ts}:{counted.input}:{counted.cached}:{counted.output}, where {x} is String(x) (so null shows as null). emitted_tc = true; give usage(key, ts, counted, root_turn, group, null).
8. An event_msg line whose payload.type is anything else, and any other rec.type, gives nothing.
Events are plain objects with exactly the keys listed. It has no side effects beyond its own local state.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:7a2f440c0450396c9bf0`, `evidence:bc1a7bbe114555e06668`, `evidence:e0921928605de73f883b`, `evidence:e6ef2013d0e75c4a9803`
