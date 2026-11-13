// Capture state transitions from the unchanged retained implementation.
import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const harness = require("./stream-harness.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [source, output] = process.argv.slice(2);
const functions = await harness.loadBaseline(path.resolve(source));
const cases = [], ids = new Set();
function add(case_id, args) {
  if (ids.has(case_id)) throw new Error("duplicate case " + case_id);
  ids.add(case_id);
  cases.push({case_id, arguments: args, capability: harness.CAPABILITY[args[0]],
    expected_result: harness.encode(harness.evaluate(structuredClone(args), functions))});
}

const prior = JSON.parse(readFileSync(path.join(root,
  ".literate/native-projects/local-spend-meter/verification/acceptance/spend-meter.json"), "utf8"));
let traces = 0;
for (const batch of prior.cases) for (const encoded of batch.arguments) {
  const [op, ...args] = JSON.parse(encoded);
  if (op === "parse_claude_lines" || op === "parse_codex_lines") {
    add("prior-trace-" + String(traces++).padStart(3, "0"),
      [op === "parse_claude_lines" ? "claude_trace" : "codex_trace", ...args]);
  }
}
for (const [i, file] of ["", "/", "a/", "x///", ".jsonl", "x.jsonl", "a.JSONL",
  "subagents/a.jsonl", "/root/session/subagents/a.jsonl", "/subagents/a/subagents/b.jsonl",
  "a\\b.jsonl", "folder/session.other", "é/会話.jsonl"].entries()) add("claude-init-" + i, ["init_claude_state", file]);
for (const [i, group] of ["", "tc:one", "unicode-会話", "tc:\"quoted\""].entries()) add("codex-init-" + i, ["init_codex_state", group]);
for (const [i, value] of [null, 0, 1, 1e12, 1e12 + 1, -1, 1.5, "0", "0012", "1000000000000",
  "1000000000001", "1.0", "1e3", " 1", "+1", "-0", "", "9".repeat(400), true, false, [], {}].entries()) {
  add("count-" + i, ["count", value]);
}
add("count-missing", ["count"]);
for (const tag of ["undefined", "nan", "infinity", "negative-infinity", "negative-zero", "bigint", "symbol"]) {
  add("count-special-" + tag, ["count_special", tag]);
}
for (const [i, value] of [null, "", " ", 1, {}, [], "bad-date", "2026-11-04T10:20:30Z",
  "2026-11-04T10:20:30.123-08:00", "2026-02-30", "2026-11-04"].entries()) add("iso-" + i, ["iso_or_null", value]);
add("iso-missing", ["iso_or_null"]);
add("codex-counts-null", ["codex_counts", null]);
for (const [i, totals] of [
  {input: 10, cached: 2, cache_write: 1, output: 3},
  {input: 2, cached: 2, cache_write: 1, output: 3},
  {input: 3, cached: 2, cache_write: 1, output: 0},
  {input: 1e12, cached: 1, cache_write: 1, output: 1e12},
  {input: 1.5, cached: 0.25, cache_write: 0.5, output: 2.25},
  {input: -1, cached: -2, cache_write: 0, output: -3},
].entries()) add("codex-counts-" + i, ["codex_counts", totals]);
for (const field of ["input", "cached", "cache_write", "output"]) for (const tag of ["nan", "infinity", "negative-infinity"]) {
  add("codex-special-" + field + "-" + tag, ["codex_counts_special", field, tag]);
}

const json = value => JSON.stringify(value), ts = "2026-11-04T12:00:00Z";
const cc = functions.init_claude_state("/repo/session.jsonl");
cc.cwd = "/repo"; cc.prompt_id = "previous"; cc.other_cwds = ["/other"]; cc.opaque = {keep: true};
add("claude-direct-restored", ["parse_claude_line", json({type:"assistant", sessionId:"new-id", cwd:"/later", timestamp:ts,
  requestId:"req-direct", message:{model:"m", usage:{input_tokens:2, output_tokens:3}, stop_reason:"end_turn"}}), cc]);
add("claude-direct-skipped", ["parse_claude_line", "{unrelated malformed", cc]);
add("claude-direct-empty-session", ["parse_claude_line", json({type:"user", promptId:"p", timestamp:ts}),
  {session_id:"", prompt_id:null, subagent:false, cwd:null}]);
const cx = functions.init_codex_state("tc:restored");
Object.assign(cx, {native:"root", thread:"thread", emitted_tc:true, prev_total:{input:20,cached:2,cache_write:0,output:5}, opaque:42});
add("codex-direct-retract", ["parse_codex_line", json({type:"token_usage_record", timestamp:ts,
  payload:{response_id:"response",usage:{input_tokens:10,output_tokens:2}}}), cx]);
add("codex-direct-invalid-usage", ["parse_codex_line", json({type:"token_usage_record", timestamp:ts,
  payload:{response_id:"bad",usage:null}}), cx]);
add("codex-direct-metadata", ["parse_codex_line", json({type:"session_meta", timestamp:ts,
  payload:{id:"child",session_id:"root",parent_thread_id:"parent",thread_source:"guardian_review"}}), cx]);

cases.sort((a,b) => a.case_id < b.case_id ? -1 : 1);
writeFileSync(output, JSON.stringify(cases, null, 2) + "\n");
console.log(JSON.stringify({cases:cases.length, prior_traces:traces,
  capabilities:new Set(cases.map(c=>c.capability)).size,
  transition_observations:cases.filter(c=>c.arguments[0].endsWith("_trace")).reduce((n,c)=>n+c.arguments[2].length,0)}));
