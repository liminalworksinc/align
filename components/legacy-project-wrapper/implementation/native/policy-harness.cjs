// Independent policy observations. Batches keep the complete matrix out of prompts.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const {pathToFileURL} = require("node:url");

const CAPABILITY = {authorize: "policy.authorize", read: "policy.can-read-goal", bind: "policy.can-bind", data: "policy.data"};
const SYMBOL = {authorize: "authorize", read: "can_read_goal", bind: "can_bind", data: "data"};
const ACTIONS = ["workspace.read", "workspace.manage", "goal.create", "session.share", "session.stop_any", "alignment.create", "spend.read", "goal.read", "goal.edit", "goal.bind", "pod.manage_members", "session.manage", "session.stop", "alignment.read"];
const POD_IDS = [null, "team1", "team2", "", "__proto__", "constructor"];
const PODS = [[], [["team1", "lead"]], [["team1", "member"]], [["team2", "lead"]],
  [["team1", "member"], ["team2", "lead"]], [["", "lead"]],
  [["__proto__", "lead"], ["constructor", "member"]], [["team1", "lead"], ["__proto__", "member"]]];

function* principals() {
  for (const wsRole of [null, "owner", "member", "viewer"])
    for (const pods of PODS)
      for (const userId of ["user", "", "__proto__", "用户\n"])
        yield {userId, wsId: "workspace", wsRole, pods};
  for (const wsId of ["", "ws_other", "__proto__", "工作\n"])
    for (const wsRole of [null, "owner", "member", "viewer"])
      for (const pods of PODS.slice(0, 3)) yield {userId: "user", wsId, wsRole, pods};
}
function* goals(p) {
  for (const visibility of ["private", "pod", "workspace"])
    for (const ownerId of [p.userId, "another-user"])
      for (const podId of POD_IDS) yield {kind: "goal", ownerId, visibility, podId};
}
function* objects(p) {
  yield {kind: "workspace"};
  yield* goals(p);
  for (const podId of POD_IDS) yield {kind: "goal_draft", podId};
  for (const goal of goals(p)) for (const hasTransfer of [false, true]) yield {kind: "bind", goal, hasTransfer};
  for (const podId of POD_IDS.filter(p => p !== null)) yield {kind: "pod", podId};
  for (const ownerId of [p.userId, "another-user"]) yield {kind: "session", ownerId};
  for (const involved of [[], [p.userId], ["another-user"], ["another-user", p.userId], [p.userId, p.userId]]) yield {kind: "alignment", involved};
}
function* vectors(operation) {
  if (!Object.hasOwn(CAPABILITY, operation)) throw new Error("unknown policy operation");
  if (operation === "data") { yield []; return; }
  for (const principal of principals()) {
    if (operation === "authorize") {
      for (const object of objects(principal)) for (const action of ACTIONS) yield [principal, action, object];
    } else for (const goal of goals(principal)) {
      if (operation === "read") yield [principal, goal];
      else for (const hasTransfer of [false, true]) yield [principal, goal, hasTransfer];
    }
  }
}
function hydrate(vector) {
  const args = structuredClone(vector);
  if (args.length) args[0].pods = new Map(args[0].pods);
  return args;
}
function encode(value, ancestors = new Set()) {
  if (value === null) return ["null"];
  const type = typeof value;
  if (type === "undefined") return ["undefined"];
  if (type === "boolean" || type === "string") return [type, value];
  if (type === "number") return [type, Object.is(value, -0) ? "-0" : String(value)];
  if (type === "bigint") return [type, String(value)];
  if (type !== "object") return [type, String(value)];
  if (ancestors.has(value)) throw new Error("cyclic policy observation");
  ancestors.add(value);
  let result;
  if (value instanceof Map) result = ["map", [...value].map(([k,v]) => [encode(k, ancestors), encode(v, ancestors)])];
  else if (Array.isArray(value)) result = ["array", Array.from(value, v => encode(v, ancestors))];
  else result = ["object", Object.keys(value).sort().map(k => [k, encode(value[k], ancestors)])];
  ancestors.delete(value);
  return result;
}
function observeCall(fn, args) {
  let outcome;
  try { outcome = ["return", encode(fn(...args))]; }
  catch (error) { outcome = ["throw", error?.constructor?.name || typeof error]; }
  return {outcome, arguments: encode(args)};
}
function countVectors(operation) {
  let count = 0; for (const ignored of vectors(operation)) { void ignored; count++; } return count;
}
function runBatch(fn, operation, start, limit, requirePureBaseline = false) {
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(limit) || limit < 1) throw new Error("invalid policy batch");
  const hash = crypto.createHash("sha256");
  let index = 0, count = 0;
  for (const vector of vectors(operation)) {
    if (index < start) { index++; continue; }
    if (count === limit) break;
    const args = hydrate(vector), before = requirePureBaseline ? encode(args) : undefined;
    const observation = observeCall(fn, args);
    if (requirePureBaseline) {
      assert.equal(observation.outcome[0], "return", "baseline throws for a supported policy input");
      assert.deepEqual(observation.arguments, before, "baseline mutates policy input state");
    }
    hash.update(String(index++) + "\n" + JSON.stringify(observation) + "\n");
    count++;
  }
  if (!count) throw new Error("empty policy batch");
  return {count, sha256: hash.digest("hex")};
}
function findModule(root, module) {
  const suffixes = [".js", ".mjs", ".cjs"].map(ext => module + ext);
  const hits = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
      if (item.name === "node_modules" || item.name.startsWith(".")) continue;
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (item.isFile() && suffixes.some(s => path.relative(root, file).split(path.sep).join("/") === s || path.relative(root, file).split(path.sep).join("/").endsWith("/" + s))) hits.push(file);
    }
  }
  walk(root);
  if (hits.length !== 1) throw new Error("expected one policy module: " + module);
  return hits[0];
}
async function loadBaseline(root) {
  const m = await import(pathToFileURL(path.join(root, "policy.ts")).href);
  return {authorize: m.authorize, read: m.canReadGoal, bind: m.canBind, data: () => Object.fromEntries(
    ["WS_ROLES", "POD_ROLES", "VISIBILITIES", "WORKSPACE_ROLE_ACTIONS", "POD_ROLE_ACTIONS", "GOAL_READERS"].map(k => [k, m[k]]))};
}
async function loadGenerated(root, operation, surface) {
  const binding = surface?.capabilities.find(c => c.capability === CAPABILITY[operation]);
  if (surface && (!binding || !binding.symbols.includes(SYMBOL[operation]))) throw new Error("missing policy capability");
  const m = await import(pathToFileURL(findModule(root, binding?.module || "policy/" + SYMBOL[operation])).href);
  const fn = m[SYMBOL[operation]] ?? m.default?.[SYMBOL[operation]] ?? m.default;
  if (typeof fn !== "function") throw new Error("missing policy callable");
  return fn;
}
async function main() {
  if (["--baseline", "--generated"].includes(process.argv[1])) {
    const [mode, raw] = process.argv.slice(1), [op, start, limit] = JSON.parse(raw);
    const fn = mode === "--baseline" ? (await loadBaseline(process.cwd()))[op] : await loadGenerated(process.cwd(), op);
    process.stdout.write(JSON.stringify(runBatch(fn, op, start, limit, mode === "--baseline")) + "\n");
  } else {
    const [root, surfaceRaw, casesRaw] = process.argv.slice(2), surface = JSON.parse(surfaceRaw);
    const cases = [];
    for (const c of JSON.parse(casesRaw)) {
      const [op, start, limit] = c.arguments;
      if (!Object.hasOwn(CAPABILITY, op) || CAPABILITY[op] !== c.capability) throw new Error("mixed policy capability batch");
      cases.push({case_id: c.case_id, capability: c.capability,
        result: runBatch(await loadGenerated(root, op, surface), op, start, limit)});
    }
    process.stdout.write(JSON.stringify({schema: "literate-ai/library-acceptance-results@1", cases}) + "\n");
  }
}
module.exports = {CAPABILITY, ACTIONS, vectors, hydrate, encode, observeCall, countVectors, runBatch, loadBaseline};
if (require.main === module || ["--baseline", "--generated"].includes(process.argv[1])) {
  main().catch(error => {console.error(error.stack || error); process.exit(1);});
}
