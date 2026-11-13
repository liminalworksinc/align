'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"6736b066696c305c66bdd420c7dd42ad97373b52ed0dc64a7058896ae0c0098b","package":"spend_stream","package_files":["codex_counts.js","count.js","helpers.js","init_claude_state.js","init_codex_state.js","iso_or_null.js","package.json","parse_claude_line.js","parse_codex_line.js"],"maximum_cases":19,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {// Verifier-owned state and event observations for the incremental parser library.
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
