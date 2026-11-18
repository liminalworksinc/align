// Compare the hook contract, never a filesystem transcript. All setup and hook I/O stays in an OS-temp sandbox.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import childProcess from "node:child_process";
import { readContextCost } from "../../src/shared/context-cost.ts";
import { fileURLToPath } from "node:url";

const NativeDate = Date;
const native = Object.fromEntries(Object.keys(fs).filter((key) => Object.getOwnPropertyDescriptor(fs, key)?.writable).map((key) => [key, fs[key]]));
const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const json = (value) => JSON.parse(JSON.stringify(value));
const encoded = (value) => value === undefined ? { $type: "undefined" } : json(value);

export function assertPortable(value, forbidden = []) {
  const visit = (item) => {
    if (typeof item === "string") {
      for (const secret of forbidden.filter(Boolean)) assert.ok(!item.includes(secret), "parity fixture contains local identity or repository metadata");
      // Only the three named placeholders can stand for absolute prefixes. URLs and relative paths are ordinary text.
      const text = item.replace(/<(?:SANDBOX|CASE|ALIGN_HOME)>(?:[/\\][^\s"'`<>]*)?/g, "")
        .replace(/\bhttps?:\/\/[^\s"'`<>]+/gi, "");
      assert.ok(!/(?:^|[\s"'`(=:>])[/\\]|\b[A-Za-z]:[/\\]/.test(text), `absolute path in parity fixture: ${item}`);
    } else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === "object") for (const [key, entry] of Object.entries(item)) { visit(key); visit(entry); }
  };
  visit(value);
}

export function createSandbox() {
  // Do not trust a caller's TMPDIR if it points into a checkout.
  const temp = os.platform() === "darwin" ? "/private/tmp" : os.platform() === "win32" ? os.tmpdir() : "/tmp";
  const root = native.mkdtempSync(path.join(temp, "align-context-parity-"));
  assert.ok(!root.startsWith(pkg + path.sep));
  const home = path.join(root, "person"), align = path.join(home, ".align"), tmp = path.join(root, "tmp");
  native.mkdirSync(align, { recursive: true }); native.mkdirSync(tmp);
  // The hooks have their own filesystem-only discovery; this boundary stops its upward walk too.
  native.mkdirSync(path.join(root, ".git"));
  native.writeFileSync(path.join(root, ".git/HEAD"), "ref: refs/heads/parity\n");
  native.writeFileSync(path.join(root, ".git/config"), "");
  const config = path.join(root, "gitconfig"); native.writeFileSync(config, "");
  const env = { HOME: home, ALIGN_HOME: align, CLAUDE_CONFIG_DIR: path.join(home, ".claude"), CODEX_HOME: path.join(home, ".codex"),
    USER: "parity-person", LOGNAME: "parity-person", TMPDIR: tmp, TMP: tmp, TEMP: tmp, TZ: "UTC", ALIGN_NO_AUTOSTART: "1",
    GIT_CEILING_DIRECTORIES: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_SYSTEM: config, GIT_CONFIG_GLOBAL: config,
    GIT_CONFIG_COUNT: "0", GIT_TERMINAL_PROMPT: "0" };
  return { root, env, clock: Date.parse("2026-11-18T12:00:00.000Z"), cleanup: () => native.rmSync(root, { recursive: true, force: true }) };
}

function normalize(value, home, sandbox) {
  const replacements = [[home, "<ALIGN_HOME>"], [path.basename(home) === ".align" ? path.dirname(path.dirname(home)) : home, "<CASE>"], [sandbox.root, "<SANDBOX>"]]
    .sort((a, b) => b[0].length - a[0].length);
  const visit = (item) => {
    if (typeof item === "string") { for (const [prefix, token] of replacements) item = item.split(prefix).join(token); return item; }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [visit(key), visit(entry)]));
    return item;
  };
  return visit(value);
}

function observe(implementation, args, sandbox, id) {
  const entry = Object.fromEntries(Object.keys(fs).filter((key) => Object.getOwnPropertyDescriptor(fs, key)?.writable).map((key) => [key, fs[key]])), random = crypto.randomBytes, fetch = globalThis.fetch;
  const states = [], sharedIO = [], counterAppends = [], budgetWrites = [], escaped = [], network = [], unsupported = [], checked = new Set();
  const home = args[0], sid = typeof args[2] === "string" ? args[2] : args[2]?.session_id;
  const lid = sid ? crypto.createHash("sha256").update(`align-local\0${args[1]}\0${sid}`).digest("base64url").slice(0, 22) : null;
  const stateFile = lid ? path.join(home, "injected", `${lid}.json`) : null;
  const readState = () => { try { return JSON.parse(native.readFileSync(stateFile, "utf8")); } catch { return {}; } };
  const inside = (file) => {
    if (typeof file === "number") return;
    const target = path.resolve(String(file));
    if (checked.has(target)) return;
    if (target !== sandbox.root && !target.startsWith(sandbox.root + path.sep)) {
      escaped.push(target); throw new Error("hook attempted I/O outside the parity sandbox");
    }
    // Refuse symlinks that would redirect an otherwise local path outside the sandbox.
    let parent = target;
    while (!native.existsSync(parent) && parent !== sandbox.root) parent = path.dirname(parent);
    const real = native.realpathSync(parent);
    if (real !== sandbox.root && !real.startsWith(sandbox.root + path.sep)) { escaped.push(target); throw new Error("hook followed a symlink outside the parity sandbox"); }
    checked.add(target);
  };
  inside(home);
  const costState = () => {
    const read = fs.readFileSync;
    fs.readFileSync = native.readFileSync;
    try { return lid ? readContextCost(home, lid) : null; } finally { fs.readFileSync = read; }
  };
  const before = readState(), beforeCost = costState();
  const methods = ["readFileSync", "statSync", "lstatSync", "existsSync", "readdirSync", "realpathSync", "accessSync", "mkdirSync", "openSync", "writeFileSync", "appendFileSync", "unlinkSync", "rmSync", "rmdirSync", "renameSync"];
  for (const method of Object.keys(entry).filter((key) => typeof entry[key] === "function" && /^[a-z]/.test(key) && !methods.includes(key) && !["readSync", "writeSync", "closeSync", "fsyncSync"].includes(key))) {
    fs[method] = () => { unsupported.push(method); throw new Error(`unsupported hook I/O: ${method}`); };
  }
  for (const method of methods) {
    fs[method] = (...values) => {
      inside(values[0]); if (method === "renameSync") inside(values[1]);
      const result = entry[method](...values);
      if (values[0] === stateFile || (method === "renameSync" && values[1] === stateFile)) sharedIO.push(method);
      if (method === "appendFileSync" && values[0] === path.join(home, "context-cost", `${lid}.jsonl`)) counterAppends.push(values[1]);
      if (method === "renameSync" && values[1] === stateFile) states.push(readState());
      if (/[/\\]budget-shown[/\\]/.test(String(values[0]))) budgetWrites.push([method, ...values]);
      return result;
    };
  }
  let randomIndex = 0;
  crypto.randomBytes = (size) => {
    const bytes = crypto.createHash("sha256").update(`${id}:${randomIndex++}`).digest();
    assert.ok(size <= bytes.length); return bytes.subarray(0, size);
  };
  globalThis.fetch = () => { network.push("fetch"); throw new Error("network blocked in parity hook"); };
  let output, error = null;
  try { output = implementation(...args); }
  catch (caught) { error = { name: caught.name, message: caught.message }; }
  finally { Object.assign(fs, entry); crypto.randomBytes = random; globalThis.fetch = fetch; }
  assert.deepEqual(escaped, [], `${id}: hook I/O escaped its sandbox`);
  assert.deepEqual(network, [], `${id}: hook attempted networking`);
  assert.deepEqual(unsupported, [], `${id}: hook used unsupported I/O`);
  return { output, error, states, sharedIO, counterAppends, budgetWrites, before, beforeCost, afterCost: costState(), sid, now: Date.now() };
}

function assertCounters(actual, name, id) {
  const out = actual.output;
  const model = typeof out === "string" ? 0 : (out?.hookSpecificOutput?.additionalContext?.length || 0) + (out?.hookSpecificOutput?.permissionDecisionReason?.length || 0);
  const person = (typeof out === "string" ? out.length : 0) + (out?.systemMessage?.length || 0) + (out?.decision === "block" ? out.reason?.length || 0 : 0);
  if (actual.sid) {
    const event = name === "sessionStart" ? "SessionStart" : ["userPromptSubmit", "command"].includes(name) ? "UserPromptSubmit" : "PreToolUse";
    for (const [key, length] of [["context_added", model], ["notices_added", person]]) {
      const previous = actual.beforeCost[key];
      const expected = length ? { characters: (previous?.characters || 0) + length, additions: (previous?.additions || 0) + 1, last_at: new Date(actual.now).toISOString(), last_event: event } : previous;
      assert.deepEqual(actual.afterCost[key], expected, `${id}: ${key} must count the exact returned length`);
    }
  }
  assert.equal(actual.counterAppends.length, (model || person) && actual.sid ? 1 : 0, `${id}: exactly one append for returned text`);
  return { model, person };
}

export async function runParity(golden, reference) {
  const sandbox = createSandbox(), env = { ...process.env }, cwd = process.cwd(), RealDate = Date;
  const processMethods = Object.fromEntries(["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"].map((key) => [key, childProcess[key]]));
  const cases = [], returns = [];
  let guard, syncBuiltinESMExports;
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, sandbox.env);
    process.chdir(sandbox.root);
    globalThis.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [Date.now()])); } static now() { return sandbox.clock; } };
    const { scriptedCases } = await import("./context-parity-cases.ts");
    // Helpers load first. A hook must never acquire networking or process dependencies.
    const module = await import("node:module");
    const { registerHooks } = module;
    syncBuiltinESMExports = module.syncBuiltinESMExports;
    guard = registerHooks({ resolve(specifier, context, next) {
      if (/^(node:)?(net|http|https|http2|tls|dgram|dns|dns\/promises|child_process|worker_threads)$/.test(specifier)) throw new Error(`blocked hook dependency: ${specifier}`);
      return next(specifier, context);
    } });
    const handlers = await import("../../src/hooks/handlers.ts");

    for (const key of Object.keys(processMethods)) childProcess[key] = () => { throw new Error("child processes blocked in hook parity"); };
    syncBuiltinESMExports();
    if (reference) reference = await import(reference);
    await scriptedCases(sandbox, handlers, (id, name, implementation, args) => {
      const saved = path.join(sandbox.root, "saved-state");
      const home = args[0], existed = native.existsSync(home);
      if (reference && existed) native.cpSync(home, saved, { recursive: true, preserveTimestamps: true });
      const actual = observe(implementation, args, sandbox, id);
      let expected = golden?.cases[cases.length];
      if (reference) {
        const after = path.join(sandbox.root, "after-state");
        if (native.existsSync(home)) native.renameSync(home, after);
        if (existed) native.cpSync(saved, home, { recursive: true, preserveTimestamps: true });
        try {
          const scriptFs = Object.fromEntries(Object.keys(native).map((key) => [key, fs[key]]));
          let original;
          Object.assign(fs, native);
          try { original = observe(reference[name], args, sandbox, id); } finally { Object.assign(fs, scriptFs); }
          assert.deepEqual(actual.output, original.output, `${id}: current output differs from the selected parent`);
          assert.deepEqual(actual.error, original.error, `${id}: current error differs from the selected parent`);
          assert.deepEqual(actual.budgetWrites, original.budgetWrites, `${id}: changed budget delivery marker writes`);
          assert.deepEqual(actual.sharedIO, original.sharedIO, `${id}: changed shared-state read/write order`);
          expected = { id, name, output: encoded(original.output), error: original.error, states: original.states };
        } finally {
          native.rmSync(home, { recursive: true, force: true });
          if (native.existsSync(after)) native.renameSync(after, home);
          native.rmSync(saved, { recursive: true, force: true });
        }
      }
      const contract = normalize({ id, name, output: encoded(actual.output), error: actual.error, states: actual.states }, home, sandbox);
      expected = normalize(expected, home, sandbox);
      assert.ok(expected, `${id}: unrecorded scripted hook call`);
      assert.equal(contract.id, expected.id, "scripted case list changed; regenerate the fixture");
      assert.equal(contract.name, expected.name, `${id}: scripted handler changed`);
      assert.deepEqual(contract.output, expected.output, `${id}: returned text or decision changed`);
      assert.deepEqual(contract.error, expected.error, `${id}: hook error`);
      assertCounters(actual, name, id);
      const expectedWrites = expected.states.length;
      assert.equal(actual.states.length, expectedWrites, `${id}: changed when shared hook state is written`);
      assert.deepEqual(contract.states, expected.states, `${id}: changed complete shared hook-state writes`);
      cases.push(expected);
      returns.push({ name, actualWrites: actual.states.length, originalWrites: expectedWrites,
        budgetContext: /reached \d+% of its team budget/.test(actual.output?.hookSpecificOutput?.additionalContext || ""),
        budgetMessage: /reached \d+% of its team budget/.test(actual.output?.systemMessage || "") });
      sandbox.clock += 100;
      if (actual.error) throw Object.assign(new Error(actual.error.message), { name: actual.error.name });
      return actual.output;
    });
    assert.equal(cases.length, 356, "all 356 scripted hook calls must remain covered");
    if (golden) assert.deepEqual(cases.map((item) => item.id), golden.cases.map((item) => item.id), "complete scripted case list must match");
    assert.ok(returns.length >= 150, `only ${returns.length} hook returns were compared`);
    for (const name of ["sessionStart", "userPromptSubmit", "preToolUse", "failureDeny", "stop"]) assert.ok(returns.some((row) => row.name === name), `no comparison for ${name}`);
    assert.ok(returns.some((row) => row.originalWrites > 0), "existing state writes were compared");
    assert.ok(returns.every((row) => row.actualWrites === row.originalWrites), "no additional shared-state writes");
    for (const name of ["sessionStart", "userPromptSubmit"]) assert.ok(returns.some((row) => row.name === name && row.budgetContext), `no budget context comparison for ${name}`);
    for (const name of ["sessionStart", "userPromptSubmit", "preToolUse"]) assert.ok(returns.some((row) => row.name === name && row.budgetMessage), `no budget message comparison for ${name}`);
    return cases;
  } finally {
    guard?.deregister(); Object.assign(childProcess, processMethods); syncBuiltinESMExports?.(); globalThis.Date = RealDate; process.chdir(cwd);
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, env); sandbox.cleanup();
  }
}
