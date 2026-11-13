'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"c39f8bc9140cd7f20ee3990e9e59f853f5e473bdb93eff4869953c279a78b7de","package":"operator_admin","package_files":["create_operator_admin.js","package.json"],"maximum_cases":3,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
// Independent private test code, in readable source. No original service algorithm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/operator-admin/driver.cjs
modules["/__private__/operator-admin/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Private verifier. Original implementations are loaded only in source mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const cp = require('node:child_process');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function relativeFile(root, relative) {
  assert.equal(typeof relative, 'string');
  assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes(':'));
  const parts = relative.split('/');
  assert(parts.every(part => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..'));
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink(), 'Private verifier input must not be a symlink');
    assert(i === parts.length - 1 ? stat.isFile() : stat.isDirectory());
  }
  return current;
}
function pinned(root, relative, hash) {
  const file = relativeFile(root, relative);
  const bytes = fs.readFileSync(file);
  assert(bytes.length <= 8 * 1024 * 1024);
  assert.equal(digest(bytes), hash, 'Private input changed: ' + relative);
  return {file, bytes};
}
function prepare(root, relative, hash) {
  const input = pinned(root, relative, hash);
  const manifest = JSON.parse(input.bytes);
  assert.equal(manifest.schema, 'align/readable-private-qualification@1');
  const files = new Map();
  for (const item of manifest.files) {
    assert(!files.has(item.name));
    const loaded = pinned(root, item.path, item.sha256);
    assert.equal(loaded.bytes.length, item.size);
    files.set(item.name, loaded);
  }
  return {manifest, files};
}
function candidatePackage(root, manifest) {
  const matches = [path.join(root, manifest.package), path.join(root, 'source', manifest.package)].filter(file => fs.existsSync(file));
  assert.equal(matches.length, 1, 'Expected exactly one generated package');
  const directory = matches[0];
  assert(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink());
  assert.deepEqual(fs.readdirSync(directory).sort(), [...manifest.package_files].sort());
  for (const name of manifest.package_files) relativeFile(directory, name);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  assert.equal(metadata.name, manifest.package);
  assert.equal(metadata.type, 'commonjs');
  assert.deepEqual(metadata.exports, manifest.package_exports);
  return directory;
}
function factoryFromBytes(bytes, symbol) {
  const blocked = () => { throw Error('Forbidden ambient generated effect'); };
  const context = vm.createContext({Date: blocked, process: new Proxy({}, {get: blocked}), console: new Proxy({}, {get: blocked}), fetch: blocked, setInterval: blocked, setTimeout: blocked, Buffer: undefined}, {codeGeneration: {strings: false, wasm: false}});
  new vm.Script('Math.random=()=>{throw Error("Forbidden ambient randomness")};').runInContext(context, {timeout: 1000});
  const module = {exports: {}};
  new vm.Script('(function(exports,module,require){"use strict";\n' + bytes.toString('utf8') + '\n})', {filename: symbol + '.js'}).runInContext(context, {timeout: 1000})(module.exports, module, blocked);
  assert.deepEqual(Object.keys(module.exports), [symbol]);
  const factory = module.exports[symbol];
  assert.equal(typeof factory, 'function');
  assert.equal(factory.name, symbol);
  assert.equal(factory.length, 1);
  assert.equal(factory.constructor.name, 'Function');
  return factory;
}
function corpus(capability, files) {
  const get = name => {
    assert(files.has(name), 'Undeclared private corpus input');
    return require(files.get(name).file);
  };
  const fixture = get(capability.fixture);
  const characterization = get(capability.characterization);
  const semantic = capability.cases ? get(capability.cases).semanticBatches() : [fixture.semanticCases()];
  const properties = [], effects = [];
  for (const entry of characterization.fault_paths) {
    let settings = entry.settings;
    if (capability.fault_settings_codec === 'semantic-label@1') {
      const matches = semantic.flat().filter(item => item.operation === entry.operation && item.settings.label === entry.settings.label);
      assert.equal(matches.length, 1, 'Fault settings require one immutable semantic case');
      assert.deepEqual(JSON.parse(JSON.stringify(matches[0].settings)), entry.settings);
      settings = matches[0].settings;
    }
    for (let propertyFault = 1; propertyFault <= entry.reads; propertyFault++) properties.push(capability.runner ? {...settings, propertyFault} : {operation: entry.operation, settings: {...settings, propertyFault}});
    for (let effectFault = 1; effectFault <= entry.effects; effectFault++) effects.push(capability.runner ? {...settings, effectFault} : {operation: entry.operation, settings: {...settings, effectFault}});
  }
  for (let captureFault = 1; captureFault <= capability.resource_count; captureFault++) effects.push(capability.runner ? {captureFault} : {operation: capability.default_operation, settings: {captureFault}});
  semantic.push(properties, effects);
  assert.deepEqual(semantic.map(entries => entries.length), characterization.batches.map(item => item.records));
  return {fixture, batches: semantic, characterization};
}
function withPublicConstants(factory, constants) {
  return resources => {
    const api = factory(resources);
    for (const name of ['LOI_EVENTS', 'FUNNEL', 'WAW_WEEKS']) {
      assert.deepEqual(JSON.parse(JSON.stringify(api[name])), constants[name]);
      if (name !== 'WAW_WEEKS') {
        assert.strictEqual(api[name], api[name]);
        assert(!Object.isFrozen(api[name]));
      }
    }
    return api;
  };
}
async function runBatch(factory, capability, batch, files) {
  const {fixture, batches, characterization} = corpus(capability, files);
  assert(Number.isSafeInteger(batch) && batch >= 0 && batch < batches.length);
  if (capability.constant_data) {
    const constants = JSON.parse(files.get(capability.constant_data).bytes).constants;
    factory = withPublicConstants(factory, constants);
  }
  const hash = crypto.createHash('sha256');
  for (const entry of batches[batch]) {
    const value = capability.runner ? await fixture.fixture(entry).run(factory) : await fixture.fixture(entry.settings).run(factory, entry.operation);
    hash.update(JSON.stringify(value) + '\n');
  }
  const actual = {batch, records: batches[batch].length, sha256: hash.digest('hex')};
  assert.deepEqual(actual, characterization.batches[batch], 'Frozen original observations differ');
  return actual;
}
async function main(args, repository) {
  const [mode, manifestPath, manifestHash, ...rest] = args;
  assert(['build','source','generated'].includes(mode));
  const {manifest, files} = prepare(repository, manifestPath, manifestHash);
  if (mode === 'build') {
    assert.equal(rest.length, 0);
    const directory = candidatePackage(process.cwd(), manifest);
    for (const name of manifest.package_files.filter(file => file.endsWith('.js'))) {
      const result = cp.spawnSync(process.execPath, ['--check', path.join(directory, name)], {encoding: 'utf8', timeout: 30000});
      assert.equal(result.status, 0, result.stderr);
    }
    console.log(JSON.stringify({schema: 'align/readable-private-package-build@1', passed: true, files: manifest.package_files.length}));
    return;
  }
  const expected = mode === 'source' ? 3 : 1;
  assert.equal(rest.length, expected);
  const [index] = JSON.parse(rest.at(-1));
  assert(Number.isSafeInteger(index) && index >= 0 && index < manifest.plans.length);
  const plan = manifest.plans[index];
  const capability = manifest.capabilities.find(item => item.id === plan.capability);
  assert(capability);
  let bytes;
  if (mode === 'source') {
    const references = JSON.parse(pinned(repository, rest[0], rest[1]).bytes);
    assert.equal(references.schema, 'align/private-original-reference@1');
    const record = references.factories.find(item => item.symbol === capability.symbol);
    assert(record);
    for (const source of references.raw_sources) pinned(process.cwd(), source.path, source.sha256);
    bytes = pinned(repository, record.path, record.sha256).bytes;
  } else {
    const directory = candidatePackage(process.cwd(), manifest);
    bytes = fs.readFileSync(path.join(directory, capability.module));
  }
  const factory = factoryFromBytes(bytes, capability.symbol);
  const value = await runBatch(factory, capability, plan.batch, files);
  assert.deepEqual(value, plan.expected_result);
  console.log(JSON.stringify(value));
}
module.exports = {main, prepare, candidatePackage, factoryFromBytes, runBatch};

};

// Private verifier module: /__private__/operator-admin/fixture.cjs
modules["/__private__/operator-admin/fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const relative="scripts/align-admin.mjs";
const schemaVersion=22;
async function observe(factory) {

const now = "2026-01-02T03:04:05.000Z";
const time = Date.parse(now);
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [time])); }
  static now() { return time; }
}
const pending = {id: "request-fixture", email: "fixture@example.invalid", name: "Fixture", status: "pending"};
const code = {id: "code-fixture", code: "created-code-fixture", expires_at: now, email: pending.email};
const workspace = {id: "workspace-fixture", name: "Synthetic workspace", deleted_at: null};
const invite = "0123456789abcdef0123";
const spent = "a".repeat(64);
const databasePath = "/fixture/data/v2/align.sqlite";
const mail = {ALIGN_EMAIL_API_URL: "https://mail.example.invalid", ALIGN_EMAIL_API_KEY: "fixture", ALIGN_EMAIL_FROM: "fixture@example.invalid"};
const records = [];

async function run(name, argv, options = {}) {
  const effects = [], output = [];
  const add = (effect, details) => effects.push(details === undefined ? {effect} : {effect, ...details});
  let status = 0;
  const exit = new Error("Synthetic process exit");
  const processPort = {
    argv: ["node", relative, ...argv], env: {ALIGN_DATA_DIR: "/fixture/data", ...options.env}, cwd: () => "/fixture",
    listeners: () => [], removeAllListeners() {}, on() {},
    exit(code) { status = code; throw exit; },
  };
  class Database {
    constructor(file, config) {
      assert.equal(file, databasePath);
      assert.equal(config.enableForeignKeyConstraints, true);
      assert.equal(config.timeout, 5000);
      add("database-open");
    }
    exec(sql) {
      if (sql.startsWith("PRAGMA")) { add("database-pragmas"); return; }
      assert(["BEGIN IMMEDIATE", "COMMIT", "ROLLBACK"].includes(sql));
      add(sql);
    }
    prepare(sql) {
      if (sql === "PRAGMA user_version") {
        return {get: () => { add("read-schema"); return {user_version: options.schema ?? schemaVersion}; }};
      }
      assert.equal(sql, "SELECT id, name, deleted_at FROM v2_workspaces WHERE id = ?");
      return {get: id => {
        assert.equal(id, workspace.id);
        add("lookup-workspace");
        return options.workspace ?? workspace;
      }};
    }
    close() { add("database-close"); }
  }
  const fixedPorts = {
    "node:fs": {
      existsSync(file) { assert.equal(file, databasePath); add("database-exists"); return !options.missingDb; },
      readFileSync(file, encoding) {
        assert.equal(encoding, "utf8");
        add("read-fixture", {file});
        if (!Object.hasOwn(options.files ?? {}, file)) throw Error("Synthetic missing input");
        return options.files[file];
      },
    },
    "node:path": {default: path.posix},
    "node:sqlite": {DatabaseSync: Database},
    "../lib/v2/core.mts": {
      CODE_DAYS: 14, REQUEST_STATUSES: ["pending", "approved", "declined"],
      V1_CODE_RE: /^[0-9a-f]{20}$/, RESTORE_DAYS: 30, SCHEMA_VERSION: schemaVersion,
      accessRequest(_db, id) { assert.equal(id, pending.id); add("find-request"); return options.request === undefined ? pending : options.request; },
      approveAccessRequest(_db, secret, id, days) { assert.equal(secret, "fixture-secret"); add("approve", {id, days}); return {request: pending, code}; },
      codeEmail(origin, _person, _code, {local}) { add("email-link", {origin, local}); return {subject: "Fixture"}; },
      declineAccessRequest(_db, id) { add("decline", {id}); return true; },
      importCreationCodes(_db, secret, rows, used, days) {
        assert.equal(secret, "fixture-secret");
        assert.equal(rows[0].code, invite);
        assert.deepEqual([...used], [spent]);
        add("import-codes", {email: rows[0].email, count: rows.length, days});
        return {imported: 1, present: 0, used: 0, spentOnV1: 1};
      },
      insertCreationCode(_db, _secret, args) { add("create-code", {...args}); return code; },
      listAccessRequests() { add("list-requests"); return []; },
      listCreationCodes() { add("list-codes"); return [{...code, state: "live", created_at: now}]; },
      postEmail() { add("send-email-port"); if (options.mailFailure) throw Error("Synthetic email failure"); },
      purgeWorkspace() { add("purge"); },
      revokeCreationCode(_db, id) { add("revoke-code", {id}); return true; },
      serverSecret(dataDir) { assert.equal(dataDir, "/fixture/data"); add("secret-port"); return "fixture-secret"; },
      undoApproval(_db, requestId, codeId) { add("undo-approval", {requestId, codeId}); },
      softDeleteWorkspace(_db, id, actor, at) { add("soft-delete", {id, actor, at}); },
      workspaceSummaries() { add("list-workspaces"); return []; },
    },
    "../lib/v2/retention-core.mts": {
      retentionNow: () => new FixedDate(),
      describeCounts: () => "Synthetic count",
      runRetention(_db, _tx, when, {dryRun, secret}) {
        assert.equal(secret, "fixture-secret");
        add("retention-port", {at: when.toISOString(), dryRun});
        return {removed: 0};
      },
    },
    "../lib/v2/metrics-core.mts": {
      LOI_EVENTS: ["loi_sent", "loi_signed"],
      buildReport(_db, {since, now: date}) { add("report-port", {since, at: date.toISOString()}); return {sample: true}; },
      formatReport: () => "Synthetic report",
      recordLoi(_db, kind, id, {noteRef, verifiedOriginal}) {
        add("record-loi", {kind, id, noteRef, verifiedOriginal});
        return kind === "loi_signed" && !verifiedOriginal ? {ok: false, reason: "verified_original_required"} : {ok: true, at: now};
      },
    },
  };
  const capture = (channel, words) => output.push({channel, text: words.join(" ")});
  const console = {log: (...words) => capture("stdout", words), error: (...words) => capture("stderr", words),
                   warn: (...words) => capture("stderr", words)};
  const resources = {
    fs: fixedPorts["node:fs"], path: fixedPorts["node:path"].default,
    core: fixedPorts["../lib/v2/core.mts"], retention: fixedPorts["../lib/v2/retention-core.mts"],
    metrics: fixedPorts["../lib/v2/metrics-core.mts"], loadSqlite: async () => fixedPorts["node:sqlite"],
    process: processPort, console, Date: FixedDate, URL,
  };
  const command = factory(resources);
  assert.deepEqual(Object.keys(command), ["run"]);
  assert.equal(command.run.name, "run");
  assert.equal(command.run.length, 0);
  try { await command.run(); } catch (error) { if (error !== exit) throw error; }
  return {name, status, effects, output};
}

const files = {"/fixture/import": "# fixture\n\n" + invite + ", FIXTURE@EXAMPLE.INVALID\n", "/fixture/spent": JSON.stringify([spent])};
const importArgs = ["codes", "import", "--file", "/fixture/import", "--used", "/fixture/spent", "--days", "10"];
const names = row => row.effects.map(item => item.effect);
const body = row => row.output.map(item => item.text).join("\n");
const startup = ["database-exists", "database-open", "database-pragmas", "read-schema"];
async function check(name, argv, options, status, sequence, inspect = () => {}) {
  const row = await run(name, argv, options);
  assert.equal(row.status, status, name);
  assert.deepEqual(names(row), sequence, name);
  inspect(row);
  records.push(row);
}

async function main() {
  await check("help-before-db", ["--help"], {}, 0, [], row => assert.match(body(row), /^Usage:/));
  await check("missing-flag-value", ["codes", "import", "--file"], {}, 2, [], row => assert.match(body(row), /needs a value/));
  await check("missing-database", ["codes", "list"], {missingDb: true}, 1, ["database-exists"]);
  await check("hosted-refuses-test-clock", ["codes", "list"], {env: {HOSTED: "1", ALIGN_TEST_NOW: now}}, 2, ["database-exists"]);
  for (const schema of [schemaVersion - 1, schemaVersion + 1]) {
    await check("wrong-schema-" + schema, ["codes", "list"], {schema}, 1, [...startup, "database-close"]);
  }
  await check("import-normalizes-and-redacts", importArgs, {files}, 0,
    [...startup, "read-fixture", "read-fixture", "secret-port", "BEGIN IMMEDIATE", "import-codes", "COMMIT", "database-close"], row => {
      assert.equal(row.effects.find(item => item.effect === "import-codes").email, pending.email);
      assert.match(body(row), /Imported 1, for 10 days/);
      assert(!body(row).includes(invite) && !body(row).includes(pending.email));
    });
  await check("import-spent-digest-refused", importArgs, {files: {...files, "/fixture/spent": '["invalid"]'}}, 1,
    [...startup, "read-fixture", "read-fixture", "database-close"]);
  await check("import-invalid-row-redacted", importArgs, {files: {...files, "/fixture/import": "# fixture\n" + invite + ",bad,email"}}, 2,
    [...startup, "read-fixture", "read-fixture", "database-close"], row => {
      assert.match(body(row), /line 2/);
      assert(!body(row).includes(invite));
    });
  await check("import-hosted-secret-refused", importArgs, {files, env: {HOSTED: "1"}}, 1,
    [...startup, "read-fixture", "read-fixture", "database-close"]);
  await check("list-redacts-email-and-code", ["codes", "list"], {}, 0, [...startup, "list-codes", "database-close"], row => {
    assert.match(body(row), /bound/);
    assert(!body(row).includes(pending.email) && !body(row).includes(code.code));
  });
  await check("create-count-cap", ["codes", "create", "--count", "51"], {}, 2, [...startup, "database-close"]);
  await check("create-normalized-email", ["codes", "create", "--email", " FIXTURE@EXAMPLE.INVALID "], {}, 0,
    [...startup, "secret-port", "BEGIN IMMEDIATE", "create-code", "COMMIT", "database-close"], row => {
      assert.equal(row.effects.find(item => item.effect === "create-code").email, pending.email);
      assert.match(body(row), /shown only now/);
    });
  await check("revoke-transaction", ["codes", "revoke", code.id], {}, 0, [...startup, "BEGIN IMMEDIATE", "revoke-code", "COMMIT", "database-close"]);
  await check("request-list", ["requests", "list", "--status", "pending"], {}, 0, [...startup, "list-requests", "database-close"]);
  await check("decline-transaction", ["requests", "decline", pending.id], {}, 0, [...startup, "BEGIN IMMEDIATE", "decline", "COMMIT", "database-close"]);
  const approve = ["requests", "approve", pending.id];
  await check("already-decided-no-approval", approve, {request: {...pending, status: "approved", decided_at: now}}, 1,
    [...startup, "find-request", "database-close"]);
  await check("hosted-link-guard-before-mutation", approve, {env: {...mail, HOSTED: "1", ALIGN_SECRET: "fixture"}}, 1,
    [...startup, "find-request", "database-close"]);
  await check("mail-failure-compensates", approve, {env: mail, mailFailure: true}, 1,
    [...startup, "find-request", "BEGIN IMMEDIATE", "secret-port", "approve", "COMMIT", "email-link", "send-email-port",
      "BEGIN IMMEDIATE", "undo-approval", "COMMIT", "database-close"], row => assert.match(body(row), /still pending/));
  await check("print-bypasses-mail-port", [...approve, "--print"], {env: mail}, 0,
    [...startup, "find-request", "BEGIN IMMEDIATE", "secret-port", "approve", "COMMIT", "database-close"]);
  await check("workspace-list", ["workspaces", "list"], {}, 0, [...startup, "list-workspaces", "database-close"]);
  const remove = ["workspaces", "delete", workspace.id];
  await check("soft-delete-confirmation", remove, {}, 1, [...startup, "lookup-workspace", "database-close"]);
  await check("purge-confirmation", [...remove, "--purge"], {}, 1, [...startup, "lookup-workspace", "database-close"]);
  await check("soft-delete-transaction", [...remove, "--yes"], {}, 0,
    [...startup, "lookup-workspace", "BEGIN IMMEDIATE", "soft-delete", "COMMIT", "database-close"]);
  await check("purge-transaction", [...remove, "--purge", "--yes"], {}, 0,
    [...startup, "lookup-workspace", "BEGIN IMMEDIATE", "purge", "COMMIT", "database-close"]);
  await check("retention-dry-run-port", ["retention", "run", "--dry-run"], {}, 0, [...startup, "secret-port", "retention-port", "database-close"],
    row => assert.equal(row.effects.find(item => item.effect === "retention-port").dryRun, true));
  await check("report-date-refused", ["report", "--since", "yesterday"], {}, 2, [...startup, "database-close"]);
  await check("report-json", ["report", "--since", "2026-01-01", "--json"], {}, 0, [...startup, "report-port", "database-close"],
    row => assert.deepEqual(JSON.parse(body(row)), {sample: true}));
  const loi = ["events", "record", "loi_signed", "--workspace", workspace.id];
  await check("signed-loi-requires-confirmation", loi, {}, 2, [...startup, "BEGIN IMMEDIATE", "record-loi", "COMMIT", "database-close"],
    row => assert.match(body(row), /needs --verified-original/));
  await check("signed-loi-passes-confirmation", [...loi, "--verified-original"], {}, 0,
    [...startup, "BEGIN IMMEDIATE", "record-loi", "COMMIT", "database-close"],
    row => assert.equal(row.effects.find(item => item.effect === "record-loi").verifiedOriginal, true));
  return records;
}
return await main();
}
module.exports={observe};

const recorded = new WeakMap();
function semanticBatches() {
  let offset = 0;
  return [10, 10, 10].map(size => {
    const cases = Array.from({length: size}, (_, index) => ({operation: 0, settings: {index: offset + index}}));
    offset += size;
    return cases;
  });
}
function fixture({index}) {
  return {async run(factory) {
    if (!recorded.has(factory)) recorded.set(factory, observe(factory));
    const observations = await recorded.get(factory);
    assert.equal(observations.length, 30);
    assert(Number.isInteger(index) && index >= 0 && index < observations.length);
    return observations[index];
  }};
}
module.exports = {semanticBatches, fixture};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/operator-admin/characterization.json": {
    "schema": "align/B28-operator-admin-frozen-observations@1",
    "fault_paths": [],
    "batches": [
      {
        "batch": 0,
        "records": 10,
        "sha256": "c89b0777f26f7aa73a96ba964382cf8704ea4131b6fc44b36ff65034984ff917"
      },
      {
        "batch": 1,
        "records": 10,
        "sha256": "12bdca6ae184296e344750b7150410d48f403b7ddcbb784905fdbbfcc20b973f"
      },
      {
        "batch": 2,
        "records": 10,
        "sha256": "940dcacd7085af7efc4d45f715a2b918c9fb7871a188f5382352fe44ea87817c"
      },
      {
        "batch": 3,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      },
      {
        "batch": 4,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ]
  }
};
const fileNames = {
  "fixture.cjs": "/__private__/operator-admin/fixture.cjs",
  "characterization.json": "/__private__/operator-admin/characterization.json"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "operator-admin",
  "package": "operator_admin",
  "package_files": [
    "package.json",
    "create_operator_admin.js"
  ],
  "package_exports": {
    "./create_operator_admin": "./create_operator_admin.js"
  },
  "capabilities": [
    {
      "id": "operator-admin.create-operator-admin",
      "symbol": "create_operator_admin",
      "module": "create_operator_admin.js",
      "fixture": "fixture.cjs",
      "cases": "fixture.cjs",
      "characterization": "characterization.json",
      "resource_count": 0,
      "default_operation": 0,
      "runner": false
    }
  ],
  "plans": [
    {
      "capability": "operator-admin.create-operator-admin",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 10,
        "sha256": "c89b0777f26f7aa73a96ba964382cf8704ea4131b6fc44b36ff65034984ff917"
      }
    },
    {
      "capability": "operator-admin.create-operator-admin",
      "batch": 1,
      "expected_result": {
        "batch": 1,
        "records": 10,
        "sha256": "12bdca6ae184296e344750b7150410d48f403b7ddcbb784905fdbbfcc20b973f"
      }
    },
    {
      "capability": "operator-admin.create-operator-admin",
      "batch": 2,
      "expected_result": {
        "batch": 2,
        "records": 10,
        "sha256": "940dcacd7085af7efc4d45f715a2b918c9fb7871a188f5382352fe44ea87817c"
      }
    }
  ],
  "files": [
    {
      "name": "fixture.cjs",
      "path": "tools/native-rewrite/qualification/operator-admin-v1/fixture.cjs",
      "sha256": "9ac3feb68007530ab1020abf4ef4db5d0eff5c8f0f544d5ce6f857353e1663b7",
      "size": 13746
    },
    {
      "name": "characterization.json",
      "path": "tools/native-rewrite/qualification/operator-admin-v1/characterization.json",
      "sha256": "2c00877869cafe18b2dd0a064d187d4bc247c4bfda9d9b164b77ac0b699b1fad",
      "size": 778
    }
  ]
};

function load(file) {
  if (loaded.has(file)) return loaded.get(file).exports;
  if (Object.hasOwn(jsonData,file)) return jsonData[file];
  assert(Object.hasOwn(modules,file),'Undeclared private verifier module '+file);
  const module = {exports:{}};
  loaded.set(file,module);
  const imports = name => {
    if (name.startsWith('node:')) return require(name);
    const resolved = name.startsWith('/') ? name : path.posix.resolve(path.posix.dirname(file),name);
    return load(resolved);
  };
  modules[file](imports,module,module.exports,file,path.posix.dirname(file));
  return module.exports;
}
const driver = load("/__private__/operator-admin/driver.cjs");

const files = new Map(Object.entries(fileNames).map(([name,file]) => [name,{file,bytes:Object.hasOwn(jsonData,file)?Buffer.from(JSON.stringify(jsonData[file])):Buffer.alloc(0)}]));
const CAPABILITIES = manifest.capabilities.map(item=>item.id);
const SYMBOLS = manifest.capabilities.map(item=>item.symbol);
const PLANS = manifest.plans;
const CASE_IDS = PLANS.map(plan=>plan.capability+'-'+String(plan.batch+1).padStart(3,'0'));
async function runSelected(root,_surface,selected) {
  assert(Array.isArray(selected)&&selected.length>0&&selected.length<=PLANS.length);
  const indices=selected.map(item=>{
    assert(Array.isArray(item.arguments)&&item.arguments.length===1);
    const index=item.arguments[0];
    assert(Number.isSafeInteger(index)&&index>=0&&index<PLANS.length);
    assert.equal(item.capability,PLANS[index].capability);
    assert.equal(item.case_id,CASE_IDS[index]);
    return index;
  });
  assert.equal(new Set(indices).size,indices.length);
  const directory=driver.candidatePackage(root,manifest),factories=new Map(),results=[];
  for(let at=0;at<selected.length;at++) {
    const item=selected[at],plan=PLANS[indices[at]];
    const capability=manifest.capabilities.find(cap=>cap.id===plan.capability);
    if(!factories.has(capability.id))factories.set(capability.id,driver.factoryFromBytes(fs.readFileSync(path.join(directory,capability.module)),capability.symbol));
    const result=await driver.runBatch(factories.get(capability.id),capability,plan.batch,files);
    assert.deepEqual(result,plan.expected_result);
    results.push({case_id:item.case_id,capability:item.capability,result});
  }
  return results;
}
module.exports={CAPABILITIES,SYMBOLS,CASE_IDS,PLANS,runSelected};
if(require.main===module) {
  assert.equal(process.argv.length,5);
  runSelected(process.argv[2],JSON.parse(process.argv[3]),JSON.parse(process.argv[4])).then(cases=>console.log(JSON.stringify({schema:'literate-ai/library-acceptance-results@1',cases}))).catch(error=>{console.error(error.stack);process.exitCode=1;});
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
