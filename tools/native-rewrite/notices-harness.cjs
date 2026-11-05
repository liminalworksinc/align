// Independent notice observations, including public prefix-array identity.
const fs = require("node:fs");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {createHash} = require("node:crypto");
const assert = require("node:assert/strict");
const CAPABILITY = {constants: "share-notices.constants", kind: "share-notices.kind",
  matches: "share-notices.is-share-state", resumed: "share-notices.resumed-held"};
const SYMBOL = {constants: "constants", kind: "kind", matches: "is_share_state", resumed: "resumed_held"};
const PREFIXES = ["share_started_", "share_err_", "share_stopped_", "upload_refused_", "server_stopped_", "signed_out_", "signed_in_", "access_lost_", "workspace_back_"];
const TEXTS = ["", "one", "two words", "__proto__", "constructor", "東京", "e\u0301", " ", " line\nbreak ", 'a"b', "[Align]", "/", "a/b/c", "\u0000", "x".repeat(400)];
const KINDS = [...new Set([...TEXTS, ...PREFIXES.flatMap(p => [p, p + "id", p.slice(0,-1), p.toUpperCase(), "x" + p, " " + p])])];
function* vectors(operation) {
  if (!Object.hasOwn(CAPABILITY, operation)) throw new Error("unknown notice operation");
  if (operation === "kind") {
    for (const id of KINDS) for (const form of [id, "/" + id, "local/" + id, "a/b/" + id, id + "/"]) yield [form];
  } else if (operation === "matches") {
    for (const kind of KINDS) yield [kind];
    for (const prefix of PREFIXES) for (const suffix of TEXTS) yield [prefix + suffix];
  } else if (operation === "resumed") {
    for (const reader of ["user", "model"]) {
      yield [[], reader];
      for (const a of TEXTS) {
        yield [[a], reader];
        for (const b of TEXTS) yield [[a,b], reader];
        yield [[a,"middle",a], reader];
        yield [Array(6).fill(a), reader];
      }
    }
  } else {
    yield ["snapshot", []];
    for (const values of [[], [""], ["custom_"], ["custom_","share_started_"], ["__proto__","constructor","同"], ["foo","Foo"], ["/","share_"]]) yield ["replace", values];
  }
}
const countVectors = operation => [...vectors(operation)].length;
function encode(value, ancestors = new Set()) {
  if (value === null) return ["null"];
  const type = typeof value;
  if (type === "undefined") return ["undefined"];
  if (type === "string" || type === "boolean") return [type, value];
  if (type !== "object") return [type, String(value)];
  if (ancestors.has(value)) throw new Error("cyclic notice observation");
  ancestors.add(value);
  const result = Array.isArray(value) ? ["array", value.length, Object.keys(value).sort().map(k => [k, encode(value[k], ancestors)])]
    : ["object", Object.keys(value).sort().map(k => [k, encode(value[k], ancestors)])];
  ancestors.delete(value);
  return result;
}
function constantsProbe(methods, mode, replacement) {
  const first = methods.constants(), second = methods.constants();
  const array = first.SHARE_STATE_NOTICES, original = [...array];
  const same = array === second.SHARE_STATE_NOTICES;
  const probes = ["", "custom_", "custom_x", "share_started_x", "signed_out_x", "__proto__", "constructorSuffix", "同x", "Foo", "fooSuffix", "/x", "unrelated"];
  try {
    if (mode === "replace") array.splice(0, array.length, ...replacement);
    else assert.equal(mode, "snapshot");
    return {same_prefix_reference: same, data: structuredClone(methods.constants()),
      matches: probes.map(kind => methods.matches(kind))};
  } finally { array.splice(0, array.length, ...original); }
}
function runBatch(methods, operation, start, limit, pureBaseline = false) {
  assert(Number.isSafeInteger(start) && start >= 0 && Number.isSafeInteger(limit) && limit > 0, "invalid notice range");
  const hash = createHash("sha256");
  let index = 0, count = 0;
  for (const vector of vectors(operation)) {
    if (index++ < start) continue;
    if (count === limit) break;
    const args = structuredClone(vector), before = encode(args), publicBefore = encode(methods.constants());
    let outcome;
    try { outcome = ["return", encode(operation === "constants" ? constantsProbe(methods,...args) : methods[operation](...args))]; }
    catch (error) { outcome = ["throw", error?.name, error?.message]; }
    const after = encode(args), publicAfter = encode(methods.constants());
    if (pureBaseline) {
      assert.equal(outcome[0], "return", "baseline throws for a supported notice input");
      assert.deepEqual(after, before, "baseline mutates notice input state");
      assert.deepEqual(publicAfter, publicBefore, "notice observation leaves public state changed");
    }
    hash.update(JSON.stringify({outcome, arguments: after, public_state: publicAfter}) + "\n");
    count++;
  }
  assert.equal(count, limit, "notice range exceeds the matrix");
  return {observations: count, sha256: hash.digest("hex")};
}
async function loadBaseline(root) {
  const m = await import(pathToFileURL(path.join(root, "notices.ts")).href);
  return {constants: () => ({SHARE_STATE_NOTICES: m.SHARE_STATE_NOTICES, RESUMED_NOTICE: m.RESUMED_NOTICE}),
    kind: m.noticeKind, matches: m.isShareStateNotice, resumed: m.resumedButHeld};
}
async function loadGenerated(root, surface) {
  const methods = {};
  for (const operation of Object.keys(CAPABILITY)) {
    const binding = surface?.capabilities.find(c => c.capability === CAPABILITY[operation]);
    if (surface && (!binding || !binding.symbols.includes(SYMBOL[operation]))) throw new Error("missing notice capability");
    const modulePath = binding?.module || "share_notices/" + SYMBOL[operation], hits = [];
    function walk(dir) {
      for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        const f = path.join(dir,e.name);
        if (e.isDirectory()) walk(f);
        else if (e.isFile() && [".js",".mjs",".cjs"].some(ext => {
          const relative = path.relative(root,f).split(path.sep).join("/");
          return relative === modulePath + ext || relative.endsWith("/" + modulePath + ext);
        })) hits.push(f);
      }
    }
    walk(root);assert.equal(hits.length,1,"expected one notice module");
    const m = await import(pathToFileURL(hits[0]).href);
    methods[operation] = m[SYMBOL[operation]] ?? m.default?.[SYMBOL[operation]] ?? m.default;
    assert.equal(typeof methods[operation],"function","missing notice callable");
  }
  return methods;
}
async function main() {
  if (["--baseline","--generated"].includes(process.argv[1])) {
    const [mode,raw] = process.argv.slice(1),[op,start,limit] = JSON.parse(raw);
    const methods = mode === "--baseline" ? await loadBaseline(process.cwd()) : await loadGenerated(process.cwd());
    process.stdout.write(JSON.stringify(runBatch(methods,op,start,limit,mode === "--baseline")) + "\n");
  } else {
    const [root,surfaceRaw,casesRaw] = process.argv.slice(2),surface = JSON.parse(surfaceRaw),cases = [];
    const methods = await loadGenerated(root,surface);
    for (const c of JSON.parse(casesRaw)) {
      const [op,start,limit] = c.arguments;assert.equal(CAPABILITY[op],c.capability,"mixed notice capability batch");
      cases.push({case_id:c.case_id,capability:c.capability,result:runBatch(methods,op,start,limit)});
    }
    process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases}) + "\n");
  }
}
module.exports = {CAPABILITY,PREFIXES,TEXTS,vectors,countVectors,encode,constantsProbe,runBatch,loadBaseline};
if (require.main === module || ["--baseline","--generated"].includes(process.argv[1])) {
  main().catch(error => {console.error(error.stack || error);process.exit(1);});
}
