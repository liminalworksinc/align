'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"699241d2bd9cbf9d9a81fc9fb323617294c46e1b718eaa11505c002e1a988816","package":"share_notices","package_files":["constants.js","is_share_state.js","kind.js","package.json","resumed_held.js"],"maximum_cases":14,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Independent notice observations, including public prefix-array identity.
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
