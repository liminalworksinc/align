// Independent observations for the public share-again wording API.
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createHash} = require("node:crypto");
const assert = require("node:assert/strict");

const CAPABILITY = {text: "share-again.text", words: "share-again.words", stopped: "share-again.stopped"};
const SYMBOL = {text: "text", words: "words", stopped: "stopped"};
const NAMES = ["", "Sean", "Una's Mac", "same", "__proto__", "constructor", "東京", "e\u0301", "\u202eprivate", "line\nbreak", "<script>", "${name}", "::align share", " ", "a".repeat(257)];
function* vectors(operation) {
  if (!Object.hasOwn(CAPABILITY, operation)) throw new Error("unknown share-again operation");
  if (operation === "words") {
    for (const who of [null, ...NAMES]) {
      yield [null, who];
      for (const name of NAMES) for (const signed_out of [false, true]) for (const has_workspace of [false, true]) {
        yield [{name, signed_out, has_workspace}, who];
      }
    }
  } else if (operation === "stopped") {
    for (const who of [null, ...NAMES]) for (const args of [[who], [who, undefined], [who, {}], [who, {deleted: undefined}], [who, {deleted: false}], [who, {deleted: true}]]) yield args;
  } else {
    yield [[]];
    for (const name of NAMES) {
      for (const parts of [[name], [{device: name}], [{devices_page: name}],
        ["before ", {device: name}, " / ", {devices_page: "Devices page"}, " after"],
        [{devices_page: name}, "", {device: name}, name],
        ["", "", {device: name}, {device: name}]]) yield [parts];
    }
  }
}
const countVectors = operation => [...vectors(operation)].length;
function encode(value, ancestors = new Set()) {
  if (value === null) return ["null"];
  const type = typeof value;
  if (type === "undefined") return ["undefined"];
  if (type === "string" || type === "boolean") return [type, value];
  if (type !== "object") return [type, String(value)];
  if (ancestors.has(value)) throw new Error("cyclic share-again observation");
  ancestors.add(value);
  const result = Array.isArray(value) ? ["array", value.length, Object.keys(value).sort().map(k => [k, encode(value[k], ancestors)])]
    : ["object", Object.keys(value).sort().map(k => [k, encode(value[k], ancestors)])];
  ancestors.delete(value);
  return result;
}
function runBatch(fn, operation, start, limit, pureBaseline = false) {
  assert(Number.isInteger(start) && start >= 0 && Number.isInteger(limit) && limit > 0, "invalid share-again range");
  const hash = createHash("sha256");
  let index = 0, count = 0;
  for (const args of vectors(operation)) {
    if (index++ < start) continue;
    if (count === limit) break;
    const before = encode(args);
    let outcome;
    try { outcome = ["return", encode(fn(...args))]; }
    catch (error) { outcome = ["throw", error?.name, error?.message]; }
    const after = encode(args);
    if (pureBaseline) {
      assert.equal(outcome[0], "return", "baseline throws for a supported share-again input");
      assert.deepEqual(after, before, "baseline mutates share-again input state");
    }
    hash.update(JSON.stringify({outcome, arguments: after}) + "\n");
    count++;
  }
  assert.equal(count, limit, "share-again range exceeds the matrix");
  return {observations: count, sha256: hash.digest("hex")};
}
async function loadBaseline(root) {
  const m = await import(pathToFileURL(path.join(root, "share-again.mts")).href);
  return {text: m.shareAgainText, words: m.shareAgainWords, stopped: m.sharingStoppedText};
}
async function loadGenerated(root, operation, surface) {
  const binding = surface?.capabilities.find(c => c.capability === CAPABILITY[operation]);
  if (surface && (!binding || !binding.symbols.includes(SYMBOL[operation]))) throw new Error("missing share-again capability");
  const modulePath = binding?.module || "share_again/" + SYMBOL[operation];
  const hits = [];
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
  assert.equal(hits.length, 1, "expected one share-again module");
  const m = await import(pathToFileURL(hits[0]).href);
  const fn = m[SYMBOL[operation]] ?? m.default?.[SYMBOL[operation]] ?? m.default;
  assert.equal(typeof fn, "function", "missing share-again callable");
  return fn;
}
async function main() {
  if (["--baseline", "--generated"].includes(process.argv[1])) {
    const [mode, raw] = process.argv.slice(1), [operation, start, limit] = JSON.parse(raw);
    const fn = mode === "--baseline" ? (await loadBaseline(process.cwd()))[operation] : await loadGenerated(process.cwd(), operation);
    process.stdout.write(JSON.stringify(runBatch(fn, operation, start, limit, mode === "--baseline")) + "\n");
  } else {
    const [root, surfaceRaw, casesRaw] = process.argv.slice(2), surface = JSON.parse(surfaceRaw);
    const cases = [];
    for (const c of JSON.parse(casesRaw)) {
      const [op, start, limit] = c.arguments;
      assert.equal(CAPABILITY[op], c.capability, "mixed share-again capability batch");
      cases.push({case_id: c.case_id, capability: c.capability,
        result: runBatch(await loadGenerated(root, op, surface), op, start, limit)});
    }
    process.stdout.write(JSON.stringify({schema: "literate-ai/library-acceptance-results@1", cases}) + "\n");
  }
}
module.exports = {CAPABILITY, NAMES, vectors, countVectors, runBatch, loadBaseline, encode};
if (require.main === module || ["--baseline", "--generated"].includes(process.argv[1])) {
  main().catch(error => {console.error(error.stack || error); process.exit(1);});
}
