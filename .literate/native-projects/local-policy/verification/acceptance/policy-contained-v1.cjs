'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"b9b30d840adca57364fa397c493a11409d3f47182e832483fc15831bb9d4038d","package":"policy","package_files":["authorize.js","can_bind.js","can_read_goal.js","data.js","package.json"],"maximum_cases":43,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Independent policy observations. Batches keep the complete matrix out of prompts.
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
}

function verifierBytes() {
  const text = historicalVerifier.toString();
  const bytes = Buffer.from(text.slice(text.indexOf('{') + 1, -1));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), SETTINGS.inner_sha256,
    'Historical verifier bytes changed');
  return bytes;
}

function directFile(directory, name) {
  assert(/^[a-zA-Z0-9_.-]+$/.test(name) && name !== '.' && name !== '..');
  const file = path.join(directory, name);
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    assert(stat.isFile() && stat.size <= 8 * 1024 * 1024, 'Unsafe candidate member');
    return fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}

async function runSelected(root, surface, selected) {
  assert(Array.isArray(selected) && selected.length > 0 && selected.length <= SETTINGS.maximum_cases);
  const input = JSON.stringify({surface, selected});
  assert(Buffer.byteLength(input) <= 256 * 1024, 'Oversized oracle request');
  assert(Buffer.byteLength(JSON.stringify(surface)) <= 64 * 1024 &&
    Buffer.byteLength(JSON.stringify(selected)) <= 64 * 1024, 'Oracle argument exceeds portable CLI bound');
  const source = fs.realpathSync(root);
  const candidates = [path.join(source, SETTINGS.package), path.join(source, 'source', SETTINGS.package)]
    .filter(file => fs.existsSync(file));
  assert.equal(candidates.length, 1, 'Expected one candidate package');
  const candidate = candidates[0];
  // Reject symlinks below the resolved caller root, including an intermediate source directory.
  let at = source;
  for (const part of path.relative(source, candidate).split(path.sep)) {
    at = path.join(at, part);
    assert(fs.lstatSync(at).isDirectory() && !fs.lstatSync(at).isSymbolicLink());
  }
  assert.deepEqual(fs.readdirSync(candidate).sort(), [...SETTINGS.package_files].sort());
  // Desktop Docker shares the home directory. Its VM need not share the OS temporary directory.
  const cache = path.join(os.homedir(), '.cache', 'align-native-oracles');
  fs.mkdirSync(cache, {recursive: true, mode: 0o700});
  const snapshot = fs.mkdtempSync(path.join(fs.realpathSync(cache), 'evaluation-'));
  const name = 'align-oracle-' + crypto.randomUUID();
  assert(!/[\r\n,]/.test(snapshot), 'Unsupported mount path');
  let started = false;
  const dockerEnvironment = {...process.env};
  // Host-side executable configuration must not load application-supplied Node preload hooks.
  delete dockerEnvironment.NODE_OPTIONS;
  delete dockerEnvironment.NODE_PATH;
  try {
    const packageRoot = path.join(snapshot, 'source', SETTINGS.package);
    fs.mkdirSync(packageRoot, {recursive: true, mode: 0o755});
    fs.chmodSync(path.join(snapshot, 'source'), 0o755);
    fs.chmodSync(packageRoot, 0o755);
    for (const file of SETTINGS.package_files) {
      fs.writeFileSync(path.join(packageRoot, file), directFile(candidate, file), {mode: 0o444});
    }
    fs.writeFileSync(path.join(snapshot, 'oracle.cjs'), verifierBytes(), {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'request.json'), input, {mode: 0o444});
    fs.writeFileSync(path.join(snapshot, 'execute.cjs'), [
      "'use strict';",
      "const input=require('./request.json');",
      "const cp=require('node:child_process');",
      "const result=cp.spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules','--max-old-space-size=512','/inputs/oracle.cjs','/inputs/source',JSON.stringify(input.surface),JSON.stringify(input.selected)],{encoding:'utf8',timeout:130000,maxBuffer:4*1024*1024});",
      "if(result.error||result.status!==0){console.error(result.error?.code||result.status,result.stderr);process.exitCode=1;}else process.stdout.write(result.stdout);",
    ].join('\n'), {mode: 0o444});
    // Do not depend on the caller's umask for container readability.
    for (const file of SETTINGS.package_files) fs.chmodSync(path.join(packageRoot, file), 0o444);
    for (const file of ['oracle.cjs', 'request.json', 'execute.cjs']) {
      fs.chmodSync(path.join(snapshot, file), 0o444);
    }
    fs.chmodSync(snapshot, 0o755);
    const info=cp.spawnSync('docker',['info','--format','{{.NCPU}}'],{env:dockerEnvironment,encoding:'utf8',timeout:10000});
    if(info.error||info.status!==0)throw Error('Docker runtime unavailable: '+(info.error?.code||info.status));
    const available=Number(info.stdout.trim());
    assert(Number.isInteger(available)&&available>=1&&available<=512,'Invalid Docker CPU capacity');
    const cpus=Math.min(SETTINGS.cpus,available);
    const argv = ['run', '--rm', '--name', name, '--pull=never', '--network=none', '--read-only',
      '--user=65532:65532', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=64', '--memory=' + SETTINGS.memory_mib + 'm', '--cpus=' + cpus,
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=128m', '--env=HOME=/tmp',
      '--mount', `type=bind,source=${snapshot},target=/inputs,readonly`,
      '--workdir=/inputs', '--entrypoint=/usr/bin/timeout', SETTINGS.image,
      '--signal=KILL', SETTINGS.worker_seconds + 's', 'node', '--no-warnings', '--max-old-space-size=512', '/inputs/execute.cjs'];
    started = true;
    const result = cp.spawnSync('docker', argv, {env: dockerEnvironment, encoding: 'utf8',
      timeout: 150000, maxBuffer: 4 * 1024 * 1024});
    if (result.error || result.status !== 0) {
      throw Error('Contained oracle failed: ' + (result.error?.code || result.status) + '\n' +
        String(result.stderr || '').slice(0, 1600));
    }
    const value = JSON.parse(result.stdout);
    assert.equal(value.schema, 'literate-ai/library-acceptance-results@1');
    assert(Array.isArray(value.cases) && value.cases.length === selected.length);
    assert.deepEqual(value.cases.map(item => [item.case_id, item.capability]),
      selected.map(item => [item.case_id, item.capability]));
    return value.cases;
  } finally {
    if (started) cp.spawnSync('docker', ['rm', '--force', name], {
      env: dockerEnvironment, stdio: 'ignore', timeout: 10000});
    fs.rmSync(snapshot, {recursive: true, force: true});
  }
}

module.exports = {runSelected};
if (require.main === module) {
  assert.equal(process.argv.length, 5);
  runSelected(process.argv[2], JSON.parse(process.argv[3]), JSON.parse(process.argv[4]))
    .then(cases => process.stdout.write(JSON.stringify({schema: 'literate-ai/library-acceptance-results@1', cases}) + '\n'))
    .catch(error => {console.error(error.stack); process.exitCode = 1;});
}
