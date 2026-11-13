// Targeted invite-cap regression. All accounts and databases belong to this test.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const sourceFile = path.resolve(process.argv[3] ?? path.join(root, "lib/v2/workspaces.ts"));
const require = createRequire(path.join(root, "package.json"));
const ts = require("typescript");
const libraries = JSON.parse(fs.readFileSync(path.join(root, "native/libraries.json"), "utf8")).libraries;
const nativeRoot = path.join(root, "lib/native");
function verifyNativePackage(name) {
  const item = libraries.find((library) => library.component === name);
  assert(item, "Missing qualified dependency: " + name);
  for (const member of item.files) {
    const directory = path.join(nativeRoot, item.package);
    const file = path.resolve(directory, member.path);
    const relative = path.relative(directory, file);
    assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink());
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), member.digest);
  }
}
for (const name of ["storage-runtime", "storage-schema", "migration-coordinator", "wording", "policy", "server-workspace-admission"]) verifyNativePackage(name);
const { create_store } = require(path.join(nativeRoot, "storage_runtime/create_store.js"));
const { change_programs } = require(path.join(nativeRoot, "storage_schema/change_programs.js"));
const { apply_migrations } = require(path.join(nativeRoot, "migration_coordinator/apply_migrations.js"));
const { count } = require(path.join(nativeRoot, "wording/count.js"));
const { authorize } = require(path.join(nativeRoot, "policy/authorize.js"));
const { create_creation } = require(path.join(nativeRoot, "server_workspace_admission/create_creation.js"));
const source = fs.readFileSync(sourceFile, "utf8");
const ast = ts.createSourceFile(sourceFile, source, ts.ScriptTarget.Latest, true);
const imports = new Map();
for (const statement of ast.statements) {
  if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
  const bindings = statement.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) continue;
  imports.set(statement.moduleSpecifier.text, bindings.elements.filter((item) => !item.isTypeOnly).map((item) => item.name.text));
}
const workspaceBinding = "../native/.bindings/server_workspaces.js";
let nativeWorkspaceFactory;
if (imports.has(workspaceBinding)) {
  verifyNativePackage("server-workspaces");
  nativeWorkspaceFactory = require(path.join(nativeRoot, "server_workspaces/create_workspaces.js")).create_workspaces;
  assert.equal(typeof nativeWorkspaceFactory, "function");
  assert.equal(nativeWorkspaceFactory.name, "create_workspaces");
  assert.equal(nativeWorkspaceFactory.length, 1);
}
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const now = Date.parse("2026-01-02T03:04:05.000Z");
const at = new Date(now).toISOString();
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
class OwnedError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
function makeStore(directory, shared) {
  return create_store({ dataDir: () => directory, shared, DatabaseSync, join: path.join,
    existsSync: fs.existsSync, mkdirSync: fs.mkdirSync, chmodSync: fs.chmodSync,
    random: () => 0.25, setTimeout, schemaVersion: change_programs().length,
    changePrograms: change_programs, applyMigrations: apply_migrations, count });
}
function close(shared) {
  if (shared.__alignV2Db) { shared.__alignV2Db.domain.close(); shared.__alignV2Db.auth.close(); }
}
async function workspace(store, label, counter) {
  const forbidden = (code, message) => new OwnedError(403, code, message);
  const creation = create_creation({ config: () => ({ hosted: true }), secret: () => "owned-test-secret",
    requireCaptcha: async () => undefined, caps: () => ({ workspaces: 10, owned: 10, members: 4 }),
    creationMode: () => "open", CODE_RE: /^[A-Za-z0-9_-]+$/, redeemCreationCode: () => true,
    get: store.get, sql: store.sql, refuseDisposable: () => undefined, V2Error: OwnedError,
    conflict: (code, message) => new OwnedError(409, code, message), forbidden, count,
    readFirstOwnerEmail: () => undefined, memberCheckNow: () => at });
  const values = { all: store.all, get: store.get, run: store.run, sql: store.sql, tx: store.tx,
    LIVE_WS: store.LIVE_WS, audit: store.audit, authorize, V2Error: OwnedError,
    badRequest: (message) => new OwnedError(400, "bad_request", message), forbidden,
    conflict: (code, message) => new OwnedError(409, code, message),
    notFound: () => new OwnedError(404, "not_found", "Not found"),
    take: () => undefined, secretToken: () => label.repeat(43), newId: (prefix) => prefix + "_" + label,
    nowIso: () => at, sha256hex: (text) => crypto.createHash("sha256").update(text).digest("hex"),
    event: () => undefined, checkMemberCap: (...args) => { creation.checkMemberCap(...args); counter.passed++; } };
  if (nativeWorkspaceFactory) values.create_workspaces = nativeWorkspaceFactory;
  const resources = new Proxy(values, { get(target, key) {
    if (Object.hasOwn(target, key)) return target[key];
    return () => { throw new Error("Unexpected invite fixture effect: " + String(key)); };
  } });
  const context = vm.createContext({ Date: Clock, Error, TypeError, RangeError, SyntaxError });
  const modules = new Map([...imports].map(([name, symbols]) => [name, new vm.SyntheticModule(symbols, function () {
    for (const symbol of symbols) this.setExport(symbol, resources[symbol]);
  }, { context, identifier: name })]));
  const subject = new vm.SourceTextModule(code, { context, identifier: "actual-workspaces-cap-regression" });
  await subject.link((name) => { assert(modules.has(name)); return modules.get(name); });
  await subject.evaluate();
  return subject.namespace;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "align-invite-cap-"));
const seedDirectory = path.join(temporary, "seed");
const seedShared = {};
const seed = makeStore(seedDirectory, seedShared);
const observations = [];
let complete = false;
try {
  // Minimal owned account rows support this workspace-only regression. This is no identity qualification.
  seed.authDb().exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL)");
  seed.migrate();
  for (const id of ["u1", "u2", "u3"]) seed.run("INSERT INTO ba_user (id,name,email) VALUES (?,?,?)", id, id, id + "@example.test");
  seed.run("INSERT INTO v2_workspaces (id,name,created_by,created_at) VALUES ('ws1','Owned test','u1',?)", at);
  for (const id of ["u1", "u2", "u3"]) seed.run("INSERT INTO v2_members (ws_id,user_id,role,created_at) VALUES ('ws1',?,?,?)", id, id === "u1" ? "owner" : "member", at);
  const seedFile = seed.dbFile();
  close(seedShared);
  for (let round = 0; round < 3; round++) for (const held of [false, true]) {
    const directory = path.join(temporary, "case-" + round + "-" + held);
    fs.mkdirSync(path.join(directory, "v2"), { recursive: true, mode: 0o700 });
    fs.copyFileSync(seedFile, path.join(directory, "v2/align.sqlite"));
    const shared = [{}, {}], counter = { passed: 0 };
    const stores = shared.map((state) => makeStore(directory, state));
    let holder;
    try {
      for (const store of stores) store.openDb();
      const subjects = await Promise.all(stores.map((store, index) => workspace(store, index ? "y" : "x", counter)));
      if (held) { holder = new DatabaseSync(path.join(directory, "v2/align.sqlite")); holder.exec("BEGIN IMMEDIATE"); }
      const principal = { userId: "u1", wsId: "ws1", wsRole: "owner", pods: new Map() };
      const requests = subjects.map((subject, index) => subject.createInvite(principal, "pending-" + index + "@example.test", "member"));
      if (holder) {
        assert.equal(counter.passed, 2, "Both requests must pass the early check while waiting for the write lock");
        assert.equal(stores[0].get("SELECT COUNT(*) AS n FROM v2_invites").n, 0);
        holder.exec("COMMIT"); holder.close(); holder = null;
      }
      const results = await Promise.allSettled(requests);
      const invites = Number(stores[0].get("SELECT COUNT(*) AS n FROM v2_invites WHERE accepted_at IS NULL AND expires_at > ?", at).n);
      const successes = results.filter((result) => result.status === "fulfilled").length;
      const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason.code);
      observations.push({ round, held_write_lock: held, members: 3, open_invites: invites, cap: 4, successes, errors,
        passed: invites === 1 && successes === 1 && errors.length === 1 && errors[0] === "member_cap" });
    } finally {
      if (holder) { try { holder.exec("ROLLBACK"); } finally { holder.close(); } }
      for (const state of shared) close(state);
    }
  }
  const failed = observations.filter((item) => !item.passed).length;
  console.log(JSON.stringify({ schema: "align/invite-cap-regression@1", passed: observations.length - failed, failed,
    source_sha256: crypto.createHash("sha256").update(source).digest("hex"), observations,
    scope: "Actual workspace source, qualified schema/store/cap/policy and independent SQLite connections. Owned minimal account rows and controlled unused services; no identity qualification." }));
  complete = failed === 0;
  if (failed) { console.error("Owned failed database fixtures retained at " + temporary); process.exitCode = 1; }
} finally {
  if (seedShared.__alignV2Db?.domain.isOpen) close(seedShared);
  if (complete) fs.rmSync(temporary, { recursive: true, force: true });
}
