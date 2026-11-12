'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"64a28be0a6466ba64eb80b9056e3565cae042f9ac17e65d8449c1a5c54028e92","package":"share_again","package_files":["package.json","stopped.js","text.js","words.js"],"maximum_cases":13,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Independent observations for the public share-again wording API.
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
function encode(value, seen = new Map()) {
  if (value === null) return ["null"];
  const type = typeof value;
  if (type === "undefined") return ["undefined"];
  if (type === "string" || type === "boolean") return [type, value];
  if (type !== "object") return [type, Object.is(value, -0) ? "-0" : String(value)];
  if (seen.has(value)) return ["ref", seen.get(value)];
  const id = seen.size; seen.set(value, id);
  const keys = Object.keys(value).sort().map(k => [k, encode(value[k], seen)]);
  return Array.isArray(value) ? ["array", id, value.length, keys]
    : ["object", id, Object.getPrototypeOf(value) === Object.prototype ? "plain" : Object.getPrototypeOf(value) === null ? "null" : "other", keys];
}
function referenceAnchors(value, seen = new Set(), result = []) {
  if (value === null || typeof value !== "object" || seen.has(value)) return result;
  seen.add(value); result.push(value);
  for (const key of Object.keys(value)) referenceAnchors(value[key], seen, result);
  return result;
}
function runBatch(fn, operation, start, limit, pureBaseline = false) {
  assert(Number.isInteger(start) && start >= 0 && Number.isInteger(limit) && limit > 0, "invalid share-again range");
  const hash = createHash("sha256");
  let index = 0, count = 0;
  for (const args of vectors(operation)) {
    if (index++ < start) continue;
    if (count === limit) break;
    const anchors = referenceAnchors(args), before = encode({arguments: args, anchors});
    let outcome;
    try { outcome = ["return", fn(...args)]; }
    catch (error) { outcome = ["throw", error?.name, error?.message]; }
    const after = encode({arguments: args, anchors});
    if (pureBaseline) {
      assert.equal(outcome[0], "return", "baseline throws for a supported share-again input");
      assert.deepEqual(after, before, "baseline mutates share-again input state");
    }
    hash.update(JSON.stringify(encode({outcome, arguments: args, anchors})) + "\n");
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
module.exports = {CAPABILITY, NAMES, vectors, countVectors, runBatch, loadBaseline, encode, referenceAnchors};
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
