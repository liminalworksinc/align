// Observe parser output as data. Input command strings are never executed.
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createHash} = require("node:crypto");
const assert = require("node:assert/strict");
const CAPABILITY = {parse: "shell-words.parse", words: "shell-words.command-words"};
const SYMBOL = {parse: "parse", words: "command_words"};
const ATOMS = ["", "echo", "a", "a b", "'two words'", '"two words"', '""', "''", "a\\ b",
  "# comment", "a#literal", "$x", "${name}", "$(printf x)", "$((1+2))", "`echo hidden`",
  "\n", "\r", "__proto__", "東京", "unterminated'", '"unterminated', "\\", ")", "("];
const REDIRS = [">", ">>", ">|", "&>", "&>>", ">&", "<", "<>", "<&", "<<", "<<-", "<<<"];
const PREFIXES = ["sudo", "env", "command", "nohup", "time", "exec", "builtin", "xargs", "VAR=1", "_X=", "aB2=v", "7NO=x", "é=v", "SUDO", "/bin/env", "--", "", "__proto__=value"];
const PARSE = (() => {
  const values = new Set(ATOMS);
  for (const a of ATOMS) for (const b of ATOMS) for (const sep of [" ", "\t", "\n", ";", "&&", "||", "|", "|&", "&", ";;", "(", ")"]) values.add(a + sep + b);
  for (const op of REDIRS) for (const target of ["", "out", "'two words'", '"two words"', "__proto__", "$x", "$(echo path)", "2", "&1", "\\ x", "\n", "#comment"]) {
    for (const lead of ["", "echo ", "echo 2", "echo '2'"]) values.add(lead + op + target);
    values.add("echo " + op + target + " < input > output");
  }
  for (const quote of ["EOF", "'EOF'", '"EOF"', "E\\OF", "'A B'", "''"]) for (const op of ["<<", "<<-"]) {
    for (const body of ["text", "a > file\n$(hidden) # literal", "\ttext\n\tEOF", "no delimiter"]) {
      values.add("cat " + op + quote + "\n" + body + "\nEOF\necho after");
    }
  }
  values.add("cat <<A <<B; echo before\none\nA\ntwo\nB\necho after");
  for (const inner of ATOMS) for (const wrap of [s => "echo $(" + s + ") tail", s => 'echo "$(' + s + ')" tail',
    s => "echo $((" + s + "))", s => "echo ${" + s + "}", s => "echo `" + s + "`", s => "echo \\\n" + s]) values.add(wrap(inner));
  for (const seed of [1, 7, 41, 20261104]) {
    let state = seed;
    const chars = "ab 01_\t\n'\"\\$(){}<>;&|#`";
    for (let n = 0; n < 256; n++) {
      let value = "";
      for (let j = 0; j < n % 81; j++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        value += chars[state % chars.length];
      }
      values.add(value);
    }
  }
  for (const pending of REDIRS.filter(op => !["<<", "<<-"].includes(op))) for (const heredoc of ["<<", "<<-"]) {
    values.add(pending + " " + heredoc + ";");
    values.add("echo " + pending + " " + heredoc + "E\nbody\nE\n");
    values.add("echo " + pending + " " + heredoc + "E target\nbody\nE\n");
  }
  return [...values];
})();
const WORDS = (() => {
  const values = [[], ["echo"], ["VAR=one"], ["sudo"], ["env", "VAR=", "command", "echo"]];
  for (const a of PREFIXES) for (const b of PREFIXES) for (const tail of [[], ["echo"], ["-u", "person", "echo"], ["VAR=body", "echo", "x"], ["--", "echo"]]) values.push([a, b, ...tail]);
  values.push([...PREFIXES.slice(0, 11), "echo", "tail"]);
  return values;
})();
function* vectors(operation) {
  if (!Object.hasOwn(CAPABILITY, operation)) throw new Error("unknown shell operation");
  for (const value of operation === "parse" ? PARSE : WORDS) yield [value];
}
const countVectors = operation => [...vectors(operation)].length;
function encode(value, ancestors = new Set()) {
  if (value === null) return ["null"];
  const type = typeof value;
  if (type === "undefined") return ["undefined"];
  if (type === "string" || type === "boolean") return [type, value];
  if (type !== "object") return [type, String(value)];
  if (ancestors.has(value)) throw new Error("cyclic shell observation");
  ancestors.add(value);
  const result = Array.isArray(value) ? ["array", value.length, Object.keys(value).sort().map(k => [k, encode(value[k], ancestors)])]
    : ["object", Object.keys(value).sort().map(k => [k, encode(value[k], ancestors)])];
  ancestors.delete(value);
  return result;
}
function runBatch(fn, operation, start, limit, pureBaseline = false) {
  assert(Number.isSafeInteger(start) && start >= 0 && Number.isSafeInteger(limit) && limit > 0, "invalid shell range");
  const hash = createHash("sha256");
  let index = 0, count = 0;
  for (const vector of vectors(operation)) {
    if (index++ < start) continue;
    if (count === limit) break;
    const args = structuredClone(vector), before = encode(args);
    let outcome;
    try { outcome = ["return", encode(fn(...args))]; }
    catch (error) { outcome = ["throw", error?.name, error?.message]; }
    const after = encode(args);
    if (pureBaseline) {
      assert.equal(outcome[0], "return", "baseline throws for a supported shell input");
      assert.deepEqual(after, before, "baseline mutates shell input state");
    }
    hash.update(JSON.stringify({outcome, arguments: after}) + "\n");
    count++;
  }
  assert.equal(count, limit, "shell range exceeds the matrix");
  return {observations: count, sha256: hash.digest("hex")};
}
async function loadBaseline(root) {
  const m = await import(pathToFileURL(path.join(root, "shell.ts")).href);
  return {parse: m.parseShell, words: m.commandWords};
}
async function loadGenerated(root, operation, surface) {
  const binding = surface?.capabilities.find(c => c.capability === CAPABILITY[operation]);
  if (surface && (!binding || !binding.symbols.includes(SYMBOL[operation]))) throw new Error("missing shell capability");
  const modulePath = binding?.module || "shell_words/" + SYMBOL[operation], hits = [];
  function walk(dir) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.isFile() && [".js", ".mjs", ".cjs"].some(ext => {
        const relative = path.relative(root, f).split(path.sep).join("/");
        return relative === modulePath + ext || relative.endsWith("/" + modulePath + ext);
      })) hits.push(f);
    }
  }
  walk(root);
  assert.equal(hits.length, 1, "expected one shell module");
  const m = await import(pathToFileURL(hits[0]).href);
  const fn = m[SYMBOL[operation]] ?? m.default?.[SYMBOL[operation]] ?? m.default;
  assert.equal(typeof fn, "function", "missing shell callable");
  return fn;
}
async function main() {
  if (["--baseline", "--generated"].includes(process.argv[1])) {
    const [mode, raw] = process.argv.slice(1), [operation, start, limit] = JSON.parse(raw);
    const fn = mode === "--baseline" ? (await loadBaseline(process.cwd()))[operation] : await loadGenerated(process.cwd(), operation);
    process.stdout.write(JSON.stringify(runBatch(fn, operation, start, limit, mode === "--baseline")) + "\n");
  } else {
    const [root, surfaceRaw, casesRaw] = process.argv.slice(2), surface = JSON.parse(surfaceRaw), cases = [];
    for (const c of JSON.parse(casesRaw)) {
      const [op, start, limit] = c.arguments;
      assert.equal(CAPABILITY[op], c.capability, "mixed shell capability batch");
      cases.push({case_id: c.case_id, capability: c.capability,
        result: runBatch(await loadGenerated(root, op, surface), op, start, limit)});
    }
    process.stdout.write(JSON.stringify({schema: "literate-ai/library-acceptance-results@1", cases}) + "\n");
  }
}
module.exports = {CAPABILITY, PARSE, WORDS, REDIRS, vectors, countVectors, runBatch, loadBaseline, encode};
if (require.main === module || ["--baseline", "--generated"].includes(process.argv[1])) {
  main().catch(error => {console.error(error.stack || error); process.exit(1);});
}
