#!/usr/bin/env python3
"""Author the incremental contract from the reviewed rules and exact retained API."""
import argparse
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
specs = root / ".literate/native-projects/local-spend-meter/components/spend-meter/specs/derived"


def prior(suffix):
    path = next(specs.glob("interface-spend-meter-" + suffix + "-*.md"))
    return path.read_text().split("### Requirement: ", 1)[1].split("\n", 1)[1].split("#### Scenario:", 1)[0].strip()


helpers = (
    "The count helper returns null for undefined or null. A string consisting only of one or more ASCII digits is converted with Number first. "
    "A JavaScript number is returned unchanged exactly when Number.isSafeInteger accepts it and it is between 0 and 1000000000000 inclusive; "
    "every other value gives NaN. Negative zero remains negative zero. The iso helper returns null unless its argument is a non-empty string; "
    "for such a string it uses ECMAScript Date.parse, returning new Date(t).toISOString() when t is finite, otherwise null. "
    "No counter coercion other than that digit-string conversion is allowed."
)
claude = prior("parse-claude-lines")
claude = claude[claude.index("For each line, in order,"):]
claude = claude.replace("For each line, in order, append the events below", "For the single line, return the events below")
claude = claude.replace("(the spend-meter.claude-counts rule, an object or null)", "(the private normalization rule below, an object or null)")
claude = claude.replace("It has no side effects beyond its own local state, which does not survive the call.",
    "Only the caller's state object is mutated. All state survives there for the next call; there is no hidden process-global parser state.")
counts = prior("claude-counts")
counts = counts[counts.index("A counts object"):]
claude = (
    "JavaScript module spend_stream/parse_claude_line exports parse_claude_line(line, state). line is a string; state is a mutable object "
    "from init_claude_state or a JSON-restored state from previous calls. Return the event array and mutate that same state object in place. "
    "Field names below refer to state properties. Fields not explicitly assigned remain unchanged, including unknown extra fields. "
    "An absent other_cwds is read as an empty array and is created only when a new non-primary folder is appended. Recording another folder does not change the primary cwd.\n\n"
    + helpers + "\n\n" + claude + "\n\nPrivate message-usage normalization:\n" + counts
)
codex = prior("parse-codex-lines")
codex = codex[codex.index("totals(u):"):]
codex = re.sub(r"State before the first line:.*?\n\n", "", codex, flags=re.S)
codex = codex.replace("For each line, in order", "For the single line")
codex = codex.replace("total_input: t.input (the key is omitted entirely when t is null)",
    "total_input: t.input when t is non-null, otherwise undefined (the own property is still present on the JavaScript event object)")
codex = codex.replace("It has no side effects beyond its own local state.",
    "Only the caller's state object is mutated. All state survives there for the next call; there is no hidden process-global parser state.")
codex = (
    "JavaScript module spend_stream/parse_codex_line exports parse_codex_line(line, state). line is a string; state is a mutable object "
    "from init_codex_state or a JSON-restored state from previous calls. Return the event array and mutate that same state object in place. "
    "Field names below refer to state properties, including group. Unmentioned fields and unknown extra fields remain unchanged. "
    "An absent other_cwds is read as an empty array and is created only when a new non-primary folder is appended. "
    "Recording another folder does not change the primary cwd. Reading an absent optional cwd does not create it; session_meta explicitly assigns cwd, including null.\n\n"
    + helpers + "\n\n" + codex
)
caps = {
    "spend-stream.init-claude-state": (
        "JavaScript module spend_stream/init_claude_state exports init_claude_state(file), taking any string representing a native-host path. "
        "The host path conventions come from the selected platform Flavor. Split file on the host path separator; let i be the last exact subagents segment. "
        "If i > 0 return exactly {session_id: parts[i-1], prompt_id: null, subagent: true, cwd: null}. "
        "Otherwise return exactly {session_id: the host basename of file with the exact suffix .jsonl removed according to Node path.basename(file, '.jsonl'), "
        "prompt_id: null, subagent: false, cwd: null}. The basename operation handles empty strings and trailing separators; a basename exactly .jsonl remains .jsonl. "
        "Do not add other_cwds or any other property. Return a fresh object on each call. No filesystem access or other side effects."
    ),
    "spend-stream.parse-claude-line": claude,
    "spend-stream.init-codex-state": (
        "JavaScript module spend_stream/init_codex_state exports init_codex_state(group), taking a string. Return a fresh object with exactly these own properties: "
        "{native: null, thread: null, query_source: 'main', auto_review: false, model: null, root_turn: null, has_tur: false, emitted_tc: false, prev_total: null, group}. "
        "Preserve group exactly, including the empty string. Do not add cwd, other_cwds or any other property. No side effects."
    ),
    "spend-stream.parse-codex-line": codex,
    "spend-stream.codex-counts": (
        "JavaScript module spend_stream/codex_counts exports codex_counts(t). t is null or an object with four JavaScript number fields input, cached, cache_write and output. "
        "If t is null return null. Otherwise fresh = t.input - t.cached - t.cache_write using ordinary JavaScript Number arithmetic. "
        "If fresh < 0 return null. Otherwise return exactly {input: fresh, output: t.output, cache_read: t.cached, cache_write_5m: 0, cache_write_1h: 0, cache_write_unsplit: t.cache_write}. "
        "Do not validate, clamp, round or coerce these fields beyond that subtraction and negative comparison. Fractional, negative, infinite and NaN number fields keep their JavaScript arithmetic behavior. "
        "Do not mutate t. No side effects."
    ),
    "spend-stream.count": (
        "JavaScript module spend_stream/count exports count(v), accepting any JavaScript value, including undefined, symbols and bigint. "
        "Return null when v is undefined or null. Let n = Number(v) only when v is a string matching /^[0-9]+$/; otherwise let n = v. "
        "Return n unchanged exactly when typeof n is number, Number.isSafeInteger(n), n >= 0 and n <= 1000000000000. Otherwise return JavaScript NaN. "
        "Preserve negative zero; invalid present input gives NaN, while absent input gives null. Do not throw for symbols or bigint. No side effects."
    ),
    "spend-stream.iso-or-null": (
        "JavaScript module spend_stream/iso_or_null exports iso_or_null(v). If v is not a string or is empty, return null. "
        "Otherwise t = Date.parse(v) using the ECMAScript built-in; return new Date(t).toISOString() if Number.isFinite(t), else null. "
        "Use those native semantics, including timezone offsets and native date normalization; do not invent a stricter parser. No side effects."
    ),
}
args.output.write_text(json.dumps({"kind": "library", "capabilities": caps}, indent=2) + "\n")
print("Authored", len(caps), "incremental capabilities")
