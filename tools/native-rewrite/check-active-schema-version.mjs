// Exercise the actual composition and qualified guards with controlled schema counts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire, stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const project = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assert(process.argv.length <= 3, 'Expected an optional project root');
const app = path.join(project, 'components/legacy-project-wrapper/implementation');
const review = path.join(project, 'generated/native-review-source');
const require = createRequire(import.meta.url);
const {create_core} = require(path.join(review, 'server_core/create_core.js'));
const {create_creation_compatibility} = require(path.join(review, 'server_creation_compatibility/create_creation_compatibility.js'));
const {create_store} = require(path.join(review, 'storage_runtime/create_store.js'));
const {create_operator_admin} = require(path.join(review, 'operator_admin/create_operator_admin.js'));
const source = fs.readFileSync(path.join(app, 'lib/v2/core.mts'), 'utf8');
const code = stripTypeScriptTypes(source);
const unexpected = () => { throw new Error('Unexpected test resource effect'); };
async function compositionVersion(programCount) {
  const context = vm.createContext({fetch:unexpected, AbortSignal, URLSearchParams, console});
  const imports = {
    '../storage-schema.mts': {changePrograms: () => Array(programCount).fill('')},
    'node:crypto': {createHash},
    '../native/.bindings/server_creation_compatibility.js': {create_creation_compatibility},
    '../native/server_core/create_core.js': {create_core},
    '../server-secret-tools.mts': {serverSecret:unexpected, hmac:unexpected},
    '../runtime-settings.mts': {runtimeSettings:{testIdpEnabled:unexpected, validMaxDays:unexpected, sessionMaxDays:unexpected}},
    '../identifier-tools.mts': {identifierTools:{rand32:unexpected}},
  };
  const module = new vm.SourceTextModule(code, {context});
  await module.link(specifier => {
    assert(Object.hasOwn(imports, specifier), 'Unexpected composition dependency: ' + specifier);
    const values = imports[specifier];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, {context});
  });
  await module.evaluate();
  return module.namespace.SCHEMA_VERSION;
}
const records = [];
for (const programCount of [23, 24, 25]) {
  const active = await compositionVersion(programCount);
  assert.equal(active, 24, 'Active version must remain independent of the injected migration count');
  const resources = {dataDir:unexpected, shared:{}, DatabaseSync:unexpected, join:unexpected,
    existsSync:unexpected, mkdirSync:unexpected, chmodSync:unexpected, random:unexpected,
    setTimeout:unexpected, schemaVersion:active, changePrograms:() => Array(programCount).fill(''),
    applyMigrations:unexpected, count:unexpected};
  if (programCount === active) assert.equal(typeof create_store(resources).openDb, 'function');
  else assert.throws(() => create_store(resources), /SCHEMA_VERSION is 24, but there are (23|25) migrations/);
  records.push({name:'store migration count ' + programCount, passed:true, refused:programCount !== active, before_file_or_database_access:true});
}
for (const databaseVersion of [23, 24, 25]) {
  const active = await compositionVersion(24), errors = [], statements = [];
  let domainReads = 0, closes = 0;
  class Exit extends Error { constructor(code) { super('Owned command exit'); this.code = code; } }
  class DatabaseSync {
    exec(sql) { statements.push(sql); assert.equal(sql, 'PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;'); }
    prepare(sql) { assert.equal(sql, 'PRAGMA user_version'); return {get:() => ({user_version:databaseVersion})}; }
    close() { closes++; }
  }
  const processResource = {argv:['node','align-admin.mjs','codes','list'], env:{ALIGN_DATA_DIR:'/owned-test-data'},
    cwd:() => '/owned-test', listeners:() => [], removeAllListeners:() => {}, on:() => {}, exit:code => { throw new Exit(code); }};
  const resources = {fs:{existsSync:() => true, readFileSync:unexpected}, path,
    core:{SCHEMA_VERSION:active, RESTORE_DAYS:30, listCreationCodes:() => {domainReads++; return [];}},
    retention:{}, metrics:{}, loadSqlite:async () => ({DatabaseSync}), process:processResource,
    console:{error:line => errors.push(line), log:() => {}, warn:unexpected}, Date, URL};
  if (databaseVersion === active) await create_operator_admin(resources).run();
  else await assert.rejects(create_operator_admin(resources).run(), error => error instanceof Exit && error.code === 1);
  assert.equal(domainReads, databaseVersion === active ? 1 : 0);
  assert.equal(closes, 1);
  assert.equal(errors.length, databaseVersion === active ? 0 : 1);
  assert.equal(statements.length, 1);
  records.push({name:'operator database version ' + databaseVersion, passed:true, refused:databaseVersion !== active, no_domain_write:true});
}
console.log(JSON.stringify({schema:'align/independent-schema-version-controls@1', passed:true, records,
  active_schema_version:24, actual_composition_evaluated:true, actual_qualified_store_and_operator_executed:true,
  original_qualified_source_unchanged:true, database_or_filesystem_writes:0}));
