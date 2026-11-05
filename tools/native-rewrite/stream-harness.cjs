// Verifier-owned state and event observations for the incremental parser library.
const fs = require("node:fs"), path = require("node:path");
const { pathToFileURL } = require("node:url");
const OPS = ["init_claude_state", "parse_claude_line", "init_codex_state",
  "parse_codex_line", "codex_counts", "count", "iso_or_null"];
const CAPABILITY = Object.fromEntries(OPS.map(op => [op, "spend-stream." + op.replaceAll("_", "-")]));
CAPABILITY.claude_trace = CAPABILITY.parse_claude_line;
CAPABILITY.codex_trace = CAPABILITY.parse_codex_line;
CAPABILITY.count_special = CAPABILITY.count;
CAPABILITY.codex_counts_special = CAPABILITY.codex_counts;

// Encode types explicitly. Undefined, absent keys, NaN, null and negative zero
// must remain distinguishable, including inside event objects and state snapshots.
function encode(value) {
  if (value === null) return ["null"];
  if (Array.isArray(value)) return ["array", value.map(encode)];
  if (typeof value === "object") return ["object", Object.keys(value).sort().map(k => [k, encode(value[k])])];
  if (typeof value === "number") return ["number", Object.is(value, -0) ? "-0" : String(value)];
  if (typeof value === "undefined") return ["undefined"];
  return [typeof value, value];
}

async function loadBaseline(root) {
  const imp = name => import(pathToFileURL(path.join(root, name + ".ts")).href);
  const [claude, codex, events] = await Promise.all([imp("claude"), imp("codex"), imp("events")]);
  return {init_claude_state: claude.initClaudeState, parse_claude_line: claude.parseClaudeLine,
    init_codex_state: codex.initCodexState, parse_codex_line: codex.parseCodexLine,
    codex_counts: codex.codexCounts, count: events.count, iso_or_null: events.isoOrNull};
}

function findModule(root, name) {
  const hits = [];
  (function walk(dir) {
    for (const file of fs.readdirSync(dir).sort()) {
      if (file.startsWith(".") || file === "node_modules") continue;
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (path.basename(dir) === "spend_stream" &&
        [name + ".js", name + ".mjs", name + ".cjs"].includes(file)) hits.push(full);
    }
  })(root);
  if (hits.length !== 1) throw new Error("expected exactly one spend_stream/" + name);
  return hits[0];
}

async function loadGenerated(root) {
  const functions = {};
  for (const op of OPS) {
    const mod = await import(pathToFileURL(findModule(root, op)).href);
    const fn = mod[op] ?? mod.default?.[op] ?? (typeof mod.default === "function" ? mod.default : undefined);
    if (typeof fn !== "function") throw new Error(op + " is not an exported function");
    functions[op] = fn;
  }
  return functions;
}

function evaluate(input, functions) {
  const [op, ...args] = input;
  if (!(op in CAPABILITY)) throw new Error("unknown verifier operation " + op);
  if (op === "claude_trace" || op === "codex_trace") {
    const prefix = op === "claude_trace" ? "claude" : "codex";
    let state = functions["init_" + prefix + "_state"](args[0]);
    const initial = structuredClone(state), steps = [];
    for (const line of args[1]) {
      const events = functions["parse_" + prefix + "_line"](line, state);
      steps.push({events: structuredClone(events), state: structuredClone(state)});
      // This is the live tailer's persistence boundary. Hidden process-local
      // state cannot substitute for the caller's serialized state.
      state = JSON.parse(JSON.stringify(state));
    }
    return {initial, steps};
  }
  if (op === "parse_claude_line" || op === "parse_codex_line") {
    const events = functions[op](args[0], args[1]);
    return {events, state: args[1]};
  }
  if (op === "count_special") {
    const values = {undefined, nan: NaN, infinity: Infinity, "negative-infinity": -Infinity,
      "negative-zero": -0, bigint: 1n, symbol: Symbol("counter")};
    return functions.count(values[args[0]]);
  }
  if (op === "codex_counts_special") {
    const totals = {input: 10, cached: 2, cache_write: 1, output: 3};
    totals[args[0]] = args[1] === "nan" ? NaN : args[1] === "infinity" ? Infinity : -Infinity;
    return functions.codex_counts(totals);
  }
  return functions[op](...args);
}

async function main() {
  const profile = ["--baseline", "--generated"].includes(process.argv[1]);
  if (profile) {
    const [mode, raw] = process.argv.slice(1);
    const functions = mode === "--baseline" ? await loadBaseline(process.cwd()) : await loadGenerated(process.cwd());
    const results = JSON.parse(raw).map(encoded => encode(evaluate(JSON.parse(encoded), functions)));
    process.stdout.write(JSON.stringify(results) + "\n");
  } else {
    const [exportDir, surfaceRaw, casesRaw] = process.argv.slice(2);
    const surface = JSON.parse(surfaceRaw), cases = JSON.parse(casesRaw);
    const functions = await loadGenerated(exportDir);
    const declared = new Set(surface.capabilities.map(c => c.capability));
    const results = cases.map(c => {
      if (!declared.has(c.capability)) throw new Error("case uses undeclared capability");
      for (const encoded of c.arguments) {
        if (CAPABILITY[JSON.parse(encoded)[0]] !== c.capability) throw new Error("mixed capability batch");
      }
      return {case_id: c.case_id, capability: c.capability,
        result: c.arguments.map(encoded => encode(evaluate(JSON.parse(encoded), functions)))};
    });
    process.stdout.write(JSON.stringify({schema: "literate-ai/library-acceptance-results@1", cases: results}) + "\n");
  }
}

module.exports = {OPS, CAPABILITY, encode, loadBaseline, evaluate};
if (require.main === module || ["--baseline", "--generated"].includes(process.argv[1])) {
  main().catch(error => {console.error(error.stack || error); process.exit(1);});
}
