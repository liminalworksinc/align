'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"2b6c937de1559940477cff1a2d39f2efec7e1ef954076ca7078fea4b5e8e0fb9","package":"storage_event_integrity","package_files":["package.json","extend_event_integrity_schema.js"],"maximum_cases":1,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
// Independent private test code, in readable source. No original service algorithm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/storage-event-integrity/driver.cjs
modules["/__private__/storage-event-integrity/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
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
  // Collection prototypes are observed in the candidate's execution realm.
  // This driver itself runs only inside the declared read-only Linux container.
  const module={exports:{}};
  const blocked=()=>{throw Error('Forbidden generated module import');};
  new Function('exports','module','require','"use strict";\n'+bytes.toString('utf8'))(module.exports,module,blocked);
  assert.deepEqual(Object.keys(module.exports),[symbol]);
  const factory=module.exports[symbol];
  assert.equal(typeof factory,'function');assert.equal(factory.name,symbol);
  assert.equal(factory.length,1);assert.equal(factory.constructor.name,'Function');
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

// Private verifier module: /__private__/storage-event-integrity/qualified-base22.cjs
modules["/__private__/storage-event-integrity/qualified-base22.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';

// Ordered SQLite transitions. Transactions and connection policy belong to the caller.
const programs = Object.freeze([
  "CREATE TABLE \"v2_alignment_approvals\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"alignment_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"at\" TEXT NOT NULL,\n  PRIMARY KEY (\"alignment_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"alignment_id\", \"revision\") REFERENCES \"v2_alignment_revisions\" (\"ws_id\", \"alignment_id\", \"revision\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_alignment_revisions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"alignment_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"choice\" TEXT NOT NULL,\n  \"effects_json\" TEXT NOT NULL,\n  \"approvers_json\" TEXT NOT NULL,\n  \"note\" TEXT,\n  \"author_id\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"alignment_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"alignment_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC),\n  CHECK (\"choice\" IN ('contribution', 'work_toward')),\n  FOREIGN KEY (\"ws_id\", \"alignment_id\") REFERENCES \"v2_alignments\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_alignment_sessions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"alignment_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  PRIMARY KEY (\"alignment_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"alignment_id\", \"revision\") REFERENCES \"v2_alignment_revisions\" (\"ws_id\", \"alignment_id\", \"revision\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"session_key\") REFERENCES \"v2_sessions\" (\"ws_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_alignment_sessions_key\" ON \"v2_alignment_sessions\" (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_alignments\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"requester_id\" TEXT NOT NULL,\n  \"target_goal_id\" TEXT NOT NULL,\n  \"source_goal_id\" TEXT,\n  \"state\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"decided_at\" TEXT,\n  \"revoked_at\" TEXT,\n  \"revoked_by\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('pending', 'countered', 'approved', 'rejected', 'withdrawn', 'revoked')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"requester_id\") REFERENCES \"v2_members\" (\"ws_id\", \"user_id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"target_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"source_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_audit\" (\n  \"seq\" INTEGER PRIMARY KEY AUTOINCREMENT,\n  \"ws_id\" TEXT,\n  \"actor_id\" TEXT,\n  \"action\" TEXT NOT NULL,\n  \"object_id\" TEXT,\n  \"at\" TEXT NOT NULL\n);\nCREATE TABLE \"v2_device_grants\" (\n  \"device_id\" TEXT NOT NULL,\n  \"ws_id\" TEXT NOT NULL,\n  PRIMARY KEY (\"device_id\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"device_id\") REFERENCES \"v2_devices\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_device_requests\" (\n  \"id\" TEXT,\n  \"device_code_hash\" TEXT NOT NULL,\n  \"user_code\" TEXT NOT NULL,\n  \"device_name\" TEXT NOT NULL,\n  \"public_key\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"expires_at\" TEXT NOT NULL,\n  \"interval_s\" INTEGER NOT NULL,\n  \"last_poll_at\" TEXT,\n  \"state\" TEXT NOT NULL,\n  \"user_id\" TEXT,\n  \"ws_ids_json\" TEXT,\n  \"device_id\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"device_code_hash\" COLLATE BINARY ASC),\n  UNIQUE (\"user_code\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('pending', 'approved', 'denied', 'consumed')),\n  FOREIGN KEY (\"user_id\") REFERENCES \"ba_user\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_device_tokens\" (\n  \"token_hash\" TEXT,\n  \"device_id\" TEXT NOT NULL,\n  \"kind\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"expires_at\" TEXT NOT NULL,\n  \"rotated_at\" TEXT,\n  PRIMARY KEY (\"token_hash\" COLLATE BINARY ASC),\n  CHECK (\"kind\" IN ('access', 'refresh')),\n  FOREIGN KEY (\"device_id\") REFERENCES \"v2_devices\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_device_tokens_device\" ON \"v2_device_tokens\" (\"device_id\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_devices\" (\n  \"id\" TEXT,\n  \"user_id\" TEXT NOT NULL,\n  \"name\" TEXT NOT NULL,\n  \"public_key\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"last_seen_at\" TEXT,\n  \"revoked_at\" TEXT,\n  \"revoked_reason\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"user_id\") REFERENCES \"ba_user\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_devices_user\" ON \"v2_devices\" (\"user_id\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_directive_targets\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"directive_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  PRIMARY KEY (\"directive_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"directive_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"directive_id\") REFERENCES \"v2_directives\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"session_key\") REFERENCES \"v2_sessions\" (\"ws_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_directive_targets_key\" ON \"v2_directive_targets\" (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_directives\" (\n  \"seq\" INTEGER PRIMARY KEY AUTOINCREMENT,\n  \"id\" TEXT NOT NULL,\n  \"ws_id\" TEXT NOT NULL,\n  \"kind\" TEXT NOT NULL,\n  \"goal_id\" TEXT,\n  \"goal_json\" TEXT,\n  \"binding_json\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  UNIQUE (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"kind\" IN ('goal_version', 'binding_changed', 'binding_suspended', 'stop', 'resume')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_epochs\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"epoch_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT,\n  \"goal_version_at_start\" INTEGER,\n  \"starts_at\" TEXT NOT NULL,\n  \"ends_at\" TEXT,\n  \"root_turn\" TEXT,\n  \"cause\" TEXT NOT NULL,\n  \"authority\" TEXT NOT NULL,\n  \"alignment_id\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC, \"epoch_id\" COLLATE BINARY ASC),\n  CHECK (\"authority\" IN ('none', 'own', 'pod', 'alignment')),\n  FOREIGN KEY (\"ws_id\", \"session_key\") REFERENCES \"v2_sessions\" (\"ws_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"alignment_id\") REFERENCES \"v2_alignments\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nCREATE UNIQUE INDEX \"v2_epochs_open\" ON \"v2_epochs\" (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC) WHERE (\"ends_at\" IS NULL);\nCREATE TABLE \"v2_goal_versions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"version\" INTEGER NOT NULL,\n  \"title\" TEXT NOT NULL,\n  \"measures_json\" TEXT NOT NULL,\n  \"anchors_json\" TEXT NOT NULL,\n  \"status\" TEXT NOT NULL,\n  \"content_hash\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"goal_id\" COLLATE BINARY ASC, \"version\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_goals\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"owner_id\" TEXT NOT NULL,\n  \"pod_id\" TEXT,\n  \"visibility\" TEXT NOT NULL,\n  \"version\" INTEGER NOT NULL,\n  \"title\" TEXT NOT NULL,\n  \"measures_json\" TEXT NOT NULL,\n  \"anchors_json\" TEXT NOT NULL,\n  \"status\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"visibility\" IN ('private', 'pod', 'workspace')),\n  CHECK (\"status\" IN ('active', 'achieved', 'dropped')),\n  CHECK ((\"visibility\" <> 'pod') OR (\"pod_id\" IS NOT NULL)),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"owner_id\") REFERENCES \"v2_members\" (\"ws_id\", \"user_id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"pod_id\") REFERENCES \"v2_pods\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_goals_ws\" ON \"v2_goals\" (\"ws_id\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_invites\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"token_hash\" TEXT NOT NULL,\n  \"email\" TEXT NOT NULL,\n  \"role\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"expires_at\" TEXT NOT NULL,\n  \"accepted_at\" TEXT,\n  \"accepted_by\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"token_hash\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"role\" IN ('owner', 'member', 'viewer')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_members\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"role\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC),\n  CHECK (\"role\" IN ('owner', 'member', 'viewer')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"user_id\") REFERENCES \"ba_user\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_members_user\" ON \"v2_members\" (\"user_id\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_pod_members\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"pod_id\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"role\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"pod_id\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC),\n  CHECK (\"role\" IN ('lead', 'member')),\n  FOREIGN KEY (\"ws_id\", \"pod_id\") REFERENCES \"v2_pods\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"user_id\") REFERENCES \"v2_members\" (\"ws_id\", \"user_id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_pods\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"name\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_receipts\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"directive_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"at\" TEXT NOT NULL,\n  \"recorded_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"directive_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC, \"state\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('received', 'applied', 'enforced')),\n  FOREIGN KEY (\"ws_id\", \"directive_id\", \"session_key\") REFERENCES \"v2_directive_targets\" (\"ws_id\", \"directive_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_sessions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"device_id\" TEXT NOT NULL,\n  \"harness\" TEXT NOT NULL,\n  \"repo_key\" TEXT NOT NULL,\n  \"repo_alias\" TEXT,\n  \"title\" TEXT,\n  \"started_at\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"stopped_at\" TEXT,\n  \"governing_goal_id\" TEXT,\n  \"governing_alignment_id\" TEXT,\n  \"agent_stopped\" INTEGER NOT NULL DEFAULT 0,\n  \"conflicts\" INTEGER NOT NULL DEFAULT 0,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  CHECK (\"harness\" IN ('claude-code', 'codex')),\n  CHECK (\"state\" IN ('shared', 'suspended', 'stopped')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"device_id\") REFERENCES \"v2_devices\" (\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"user_id\") REFERENCES \"v2_members\" (\"ws_id\", \"user_id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_alignment_id\") REFERENCES \"v2_alignments\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_sessions_device\" ON \"v2_sessions\" (\"device_id\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_usage\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"request_key\" TEXT NOT NULL,\n  \"epoch_id\" TEXT NOT NULL,\n  \"ts\" TEXT NOT NULL,\n  \"model\" TEXT NOT NULL,\n  \"query_source\" TEXT NOT NULL,\n  \"input\" INTEGER NOT NULL,\n  \"output\" INTEGER NOT NULL,\n  \"cache_read\" INTEGER NOT NULL,\n  \"cache_write_5m\" INTEGER NOT NULL,\n  \"cache_write_1h\" INTEGER NOT NULL,\n  \"cache_write_unsplit\" INTEGER NOT NULL,\n  \"basis\" TEXT NOT NULL,\n  \"est_list_usd_micros\" INTEGER,\n  \"price_table_version\" TEXT,\n  \"source\" TEXT NOT NULL,\n  \"received_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC, \"request_key\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"session_key\", \"epoch_id\") REFERENCES \"v2_epochs\" (\"ws_id\", \"session_key\", \"epoch_id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_usage_ws_ts\" ON \"v2_usage\" (\"ws_id\" COLLATE BINARY ASC, \"ts\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_workspaces\" (\n  \"id\" TEXT,\n  \"name\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC)\n);",
  "CREATE TABLE \"v2_activity\" (\n  \"seq\" INTEGER PRIMARY KEY AUTOINCREMENT,\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT,\n  \"repo_id\" TEXT NOT NULL,\n  \"kind\" TEXT NOT NULL,\n  \"path_hash\" TEXT,\n  \"path\" TEXT,\n  \"text\" TEXT,\n  \"at\" TEXT NOT NULL,\n  \"expires_at\" TEXT NOT NULL,\n  CHECK (\"kind\" IN ('edit', 'commit', 'task', 'claim')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"session_key\") REFERENCES \"v2_sessions\" (\"ws_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_activity_expiry\" ON \"v2_activity\" (\"ws_id\" COLLATE BINARY ASC, \"expires_at\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_activity_ws\" ON \"v2_activity\" (\"ws_id\" COLLATE BINARY ASC, \"seq\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_goal_acks\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"parent_id\" TEXT NOT NULL,\n  \"parent_version\" INTEGER NOT NULL,\n  \"at\" TEXT NOT NULL,\n  PRIMARY KEY (\"goal_id\" COLLATE BINARY ASC, \"parent_id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"parent_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nALTER TABLE \"v2_goal_versions\" ADD COLUMN \"depends_on_json\" TEXT NOT NULL DEFAULT '[]';\nALTER TABLE \"v2_goals\" ADD COLUMN \"depends_on_json\" TEXT NOT NULL DEFAULT '[]';",
  "CREATE TABLE \"__next_v2_alignments\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"requester_id\" TEXT NOT NULL,\n  \"target_goal_id\" TEXT NOT NULL,\n  \"source_goal_id\" TEXT,\n  \"state\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"decided_at\" TEXT,\n  \"revoked_at\" TEXT,\n  \"revoked_by\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('pending', 'countered', 'approved', 'rejected', 'withdrawn', 'revoked')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"target_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"source_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_alignments\" (\"rowid\", \"id\", \"ws_id\", \"requester_id\", \"target_goal_id\", \"source_goal_id\", \"state\", \"revision\", \"created_at\", \"updated_at\", \"decided_at\", \"revoked_at\", \"revoked_by\") SELECT \"rowid\", \"id\", \"ws_id\", \"requester_id\", \"target_goal_id\", \"source_goal_id\", \"state\", \"revision\", \"created_at\", \"updated_at\", \"decided_at\", \"revoked_at\", \"revoked_by\" FROM \"v2_alignments\";\nDROP TABLE \"v2_alignments\";\nALTER TABLE \"__next_v2_alignments\" RENAME TO \"v2_alignments\";\nCREATE INDEX \"v2_audit_ws\" ON \"v2_audit\" (\"ws_id\" COLLATE BINARY ASC, \"seq\" COLLATE BINARY ASC);\nCREATE TABLE \"__next_v2_goals\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"owner_id\" TEXT NOT NULL,\n  \"pod_id\" TEXT,\n  \"visibility\" TEXT NOT NULL,\n  \"version\" INTEGER NOT NULL,\n  \"title\" TEXT NOT NULL,\n  \"measures_json\" TEXT NOT NULL,\n  \"anchors_json\" TEXT NOT NULL,\n  \"status\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"depends_on_json\" TEXT NOT NULL DEFAULT '[]',\n  \"level\" TEXT NOT NULL DEFAULT 'team',\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"visibility\" IN ('private', 'pod', 'workspace')),\n  CHECK (\"status\" IN ('active', 'achieved', 'dropped')),\n  CHECK (\"level\" IN ('company', 'team')),\n  CHECK ((\"visibility\" <> 'pod') OR (\"pod_id\" IS NOT NULL)),\n  CHECK ((\"level\" <> 'company') OR ((\"pod_id\" IS NULL) AND (\"visibility\" = 'workspace'))),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"pod_id\") REFERENCES \"v2_pods\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_goals\" (\"rowid\", \"id\", \"ws_id\", \"owner_id\", \"pod_id\", \"visibility\", \"version\", \"title\", \"measures_json\", \"anchors_json\", \"status\", \"created_at\", \"updated_at\", \"depends_on_json\") SELECT \"rowid\", \"id\", \"ws_id\", \"owner_id\", \"pod_id\", \"visibility\", \"version\", \"title\", \"measures_json\", \"anchors_json\", \"status\", \"created_at\", \"updated_at\", \"depends_on_json\" FROM \"v2_goals\";\nDROP TABLE \"v2_goals\";\nALTER TABLE \"__next_v2_goals\" RENAME TO \"v2_goals\";\nCREATE INDEX \"v2_goals_ws\" ON \"v2_goals\" (\"ws_id\" COLLATE BINARY ASC);\nCREATE TABLE \"__next_v2_invites\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"token_hash\" TEXT NOT NULL,\n  \"email\" TEXT NOT NULL,\n  \"role\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"expires_at\" TEXT NOT NULL,\n  \"accepted_at\" TEXT,\n  \"accepted_by\" TEXT,\n  \"team_id\" TEXT,\n  \"team_role\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"token_hash\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"role\" IN ('owner', 'member', 'viewer')),\n  CHECK (\"team_role\" IN ('lead', 'member')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_invites\" (\"rowid\", \"id\", \"ws_id\", \"token_hash\", \"email\", \"role\", \"created_by\", \"created_at\", \"expires_at\", \"accepted_at\", \"accepted_by\") SELECT \"rowid\", \"id\", \"ws_id\", \"token_hash\", \"email\", \"role\", \"created_by\", \"created_at\", \"expires_at\", \"accepted_at\", \"accepted_by\" FROM \"v2_invites\";\nDROP TABLE \"v2_invites\";\nALTER TABLE \"__next_v2_invites\" RENAME TO \"v2_invites\";\nCREATE TABLE \"__next_v2_sessions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"device_id\" TEXT NOT NULL,\n  \"harness\" TEXT NOT NULL,\n  \"repo_key\" TEXT NOT NULL,\n  \"repo_alias\" TEXT,\n  \"title\" TEXT,\n  \"started_at\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"stopped_at\" TEXT,\n  \"governing_goal_id\" TEXT,\n  \"governing_alignment_id\" TEXT,\n  \"agent_stopped\" INTEGER NOT NULL DEFAULT 0,\n  \"conflicts\" INTEGER NOT NULL DEFAULT 0,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  CHECK (\"harness\" IN ('claude-code', 'codex')),\n  CHECK (\"state\" IN ('shared', 'suspended', 'stopped')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"device_id\") REFERENCES \"v2_devices\" (\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_alignment_id\") REFERENCES \"v2_alignments\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_sessions\" (\"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\") SELECT \"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\" FROM \"v2_sessions\";\nDROP TABLE \"v2_sessions\";\nALTER TABLE \"__next_v2_sessions\" RENAME TO \"v2_sessions\";\nCREATE INDEX \"v2_sessions_device\" ON \"v2_sessions\" (\"device_id\" COLLATE BINARY ASC);",
  "CREATE TABLE \"v2_oauth_grants\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"client_id\" TEXT NOT NULL,\n  \"client_name\" TEXT NOT NULL,\n  \"redirect_host\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"last_used_at\" TEXT,\n  \"refresh_hash\" TEXT NOT NULL,\n  \"prev_refresh_hash\" TEXT,\n  \"refresh_exp\" INTEGER NOT NULL,\n  \"kid\" TEXT NOT NULL,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"user_id\") REFERENCES \"v2_members\" (\"ws_id\", \"user_id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_oauth_grants_member\" ON \"v2_oauth_grants\" (\"ws_id\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC, \"created_at\" COLLATE BINARY ASC);",
  "CREATE TABLE \"v2_change_request_revisions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"change_request_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"base_version\" INTEGER NOT NULL,\n  \"changes_json\" TEXT NOT NULL,\n  \"note\" TEXT,\n  \"author_id\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"change_request_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"change_request_id\") REFERENCES \"v2_change_requests\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_change_requests\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"requester_id\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"base_version\" INTEGER NOT NULL,\n  \"changes_json\" TEXT NOT NULL,\n  \"reason\" TEXT NOT NULL,\n  \"approved_by\" TEXT,\n  \"rejected_by\" TEXT,\n  \"decision_note\" TEXT,\n  \"version\" INTEGER,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"decided_at\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('pending', 'countered', 'approved', 'rejected', 'withdrawn', 'superseded')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_change_requests_goal\" ON \"v2_change_requests\" (\"ws_id\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC);\nCREATE UNIQUE INDEX \"v2_change_requests_open\" ON \"v2_change_requests\" (\"goal_id\" COLLATE BINARY ASC, \"requester_id\" COLLATE BINARY ASC) WHERE (\"state\" IN ('pending', 'countered'));",
  "CREATE TABLE \"v2_former_members\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"user_id\" TEXT,\n  \"n\" INTEGER,\n  \"removed_at\" TEXT NOT NULL,\n  \"pseudonymised_at\" TEXT,\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE UNIQUE INDEX \"v2_former_members_n\" ON \"v2_former_members\" (\"ws_id\" COLLATE BINARY ASC, \"n\" COLLATE BINARY ASC) WHERE (\"n\" IS NOT NULL);\nCREATE UNIQUE INDEX \"v2_former_members_pending\" ON \"v2_former_members\" (\"ws_id\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC) WHERE (\"user_id\" IS NOT NULL);\nCREATE TABLE \"v2_spend_rollups\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"day\" TEXT NOT NULL,\n  \"model\" TEXT NOT NULL,\n  \"basis\" TEXT NOT NULL,\n  \"requests\" INTEGER NOT NULL,\n  \"input\" INTEGER NOT NULL,\n  \"output\" INTEGER NOT NULL,\n  \"cache_read\" INTEGER NOT NULL,\n  \"cache_write_5m\" INTEGER NOT NULL,\n  \"cache_write_1h\" INTEGER NOT NULL,\n  \"cache_write_unsplit\" INTEGER NOT NULL,\n  \"est_list_usd_micros\" INTEGER NOT NULL,\n  \"unpriced_requests\" INTEGER NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC, \"day\" COLLATE BINARY ASC, \"model\" COLLATE BINARY ASC, \"basis\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"__next_v2_sessions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"device_id\" TEXT,\n  \"harness\" TEXT NOT NULL,\n  \"repo_key\" TEXT NOT NULL,\n  \"repo_alias\" TEXT,\n  \"title\" TEXT,\n  \"started_at\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"stopped_at\" TEXT,\n  \"governing_goal_id\" TEXT,\n  \"governing_alignment_id\" TEXT,\n  \"agent_stopped\" INTEGER NOT NULL DEFAULT 0,\n  \"conflicts\" INTEGER NOT NULL DEFAULT 0,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  CHECK (\"harness\" IN ('claude-code', 'codex')),\n  CHECK (\"state\" IN ('shared', 'suspended', 'stopped')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"device_id\") REFERENCES \"v2_devices\" (\"id\") ON DELETE SET NULL ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_alignment_id\") REFERENCES \"v2_alignments\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_sessions\" (\"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\") SELECT \"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\" FROM \"v2_sessions\";\nDROP TABLE \"v2_sessions\";\nALTER TABLE \"__next_v2_sessions\" RENAME TO \"v2_sessions\";\nCREATE INDEX \"v2_sessions_device\" ON \"v2_sessions\" (\"device_id\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_sessions_user\" ON \"v2_sessions\" (\"ws_id\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC);\nALTER TABLE \"v2_workspaces\" ADD COLUMN \"deleted_at\" TEXT;",
  "CREATE TABLE \"v2_passkey_prompt_dismissed\" (\n  \"user_id\" TEXT,\n  \"dismissed_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"user_id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"user_id\") REFERENCES \"ba_user\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_passkey_use\" (\n  \"passkey_id\" TEXT,\n  \"last_used_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"passkey_id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"passkey_id\") REFERENCES \"ba_passkey\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);",
  "CREATE TABLE \"v2_access_requests\" (\n  \"id\" TEXT,\n  \"email\" TEXT NOT NULL,\n  \"name\" TEXT NOT NULL,\n  \"company\" TEXT,\n  \"team_size\" TEXT,\n  \"use_case\" TEXT NOT NULL,\n  \"interest\" TEXT NOT NULL,\n  \"status\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"decided_at\" TEXT,\n  \"code_id\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  CHECK (\"interest\" IN ('try', 'evaluate')),\n  CHECK (\"status\" IN ('pending', 'approved', 'declined'))\n);\nCREATE INDEX \"v2_access_requests_email\" ON \"v2_access_requests\" (\"email\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_access_requests_status\" ON \"v2_access_requests\" (\"status\" COLLATE BINARY ASC, \"created_at\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_creation_codes\" (\n  \"id\" TEXT,\n  \"code_hash\" TEXT NOT NULL,\n  \"email\" TEXT,\n  \"request_id\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  \"expires_at\" TEXT NOT NULL,\n  \"revoked_at\" TEXT,\n  \"redeemed_at\" TEXT,\n  \"redeemed_by\" TEXT,\n  \"ws_id\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"code_hash\" COLLATE BINARY ASC)\n);\nCREATE INDEX \"v2_creation_codes_email\" ON \"v2_creation_codes\" (\"email\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_rate_hits\" (\n  \"key\" TEXT NOT NULL,\n  \"at\" INTEGER NOT NULL\n);\nCREATE INDEX \"v2_rate_hits_at\" ON \"v2_rate_hits\" (\"at\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_rate_hits_key\" ON \"v2_rate_hits\" (\"key\" COLLATE BINARY ASC, \"at\" COLLATE BINARY ASC);",
  "CREATE TABLE \"v2_change_request_evidence\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"change_request_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"kind\" TEXT NOT NULL,\n  \"url\" TEXT NOT NULL,\n  \"label\" TEXT NOT NULL,\n  \"source\" TEXT NOT NULL,\n  \"added_by\" TEXT NOT NULL,\n  \"added_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  CHECK (\"kind\" IN ('pr', 'ci_run', 'incident', 'dashboard', 'doc', 'other')),\n  CHECK (\"source\" IN ('person', 'agent')),\n  FOREIGN KEY (\"ws_id\", \"change_request_id\") REFERENCES \"v2_change_requests\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"change_request_id\", \"revision\") REFERENCES \"v2_change_request_revisions\" (\"change_request_id\", \"revision\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_change_request_evidence_rev\" ON \"v2_change_request_evidence\" (\"change_request_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC);\nALTER TABLE \"v2_change_request_revisions\" ADD COLUMN \"snapshot_json\" TEXT;\nALTER TABLE \"v2_change_requests\" ADD COLUMN \"approved_without_evidence\" INTEGER;\nALTER TABLE \"v2_oauth_grants\" ADD COLUMN \"scope\" TEXT NOT NULL DEFAULT 'goals:read';",
  "CREATE TABLE \"v2_events\" (\n  \"id\" INTEGER PRIMARY KEY,\n  \"name\" TEXT NOT NULL,\n  \"ws_id\" TEXT,\n  \"actor\" TEXT,\n  \"at\" TEXT NOT NULL,\n  \"props\" TEXT NOT NULL DEFAULT '{}',\n  CHECK (json_valid(\"props\") AND (json_type(\"props\") = 'object'))\n);\nCREATE INDEX \"v2_events_actor\" ON \"v2_events\" (\"actor\" COLLATE BINARY ASC) WHERE (\"actor\" IS NOT NULL);\nCREATE INDEX \"v2_events_name_at\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"at\" COLLATE BINARY ASC);\nCREATE UNIQUE INDEX \"v2_events_once_person\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC, \"actor\" COLLATE BINARY ASC) WHERE (((\"name\" = 'member_first_session_captured') AND (\"ws_id\" IS NOT NULL)) AND (\"actor\" IS NOT NULL));\nCREATE UNIQUE INDEX \"v2_events_once_ws\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC) WHERE ((\"ws_id\" IS NOT NULL) AND (\"name\" IN ('workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined', 'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed')));\nCREATE INDEX \"v2_events_ws\" ON \"v2_events\" (\"ws_id\" COLLATE BINARY ASC, \"name\" COLLATE BINARY ASC);\nCREATE TRIGGER \"v2_events_append_only\" BEFORE UPDATE OF \"id\", \"name\", \"at\", \"props\" ON \"v2_events\" BEGIN SELECT RAISE(ABORT, 'v2_events is append-only'); END;",
  "CREATE TABLE \"v2_ask_mentions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"ask_id\" TEXT NOT NULL,\n  \"n\" INTEGER NOT NULL,\n  \"date\" TEXT NOT NULL,\n  \"text\" TEXT NOT NULL,\n  \"source_title\" TEXT NOT NULL,\n  \"added_by\" TEXT NOT NULL,\n  \"added_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ask_id\" COLLATE BINARY ASC, \"n\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"ask_id\") REFERENCES \"v2_asks\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_asks\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"team_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT,\n  \"text\" TEXT NOT NULL,\n  \"from_label\" TEXT,\n  \"created_by\" TEXT NOT NULL,\n  \"source_kind\" TEXT NOT NULL,\n  \"source_title\" TEXT,\n  \"source_date\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"decided_by\" TEXT,\n  \"decided_at\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"source_kind\" IN ('meeting', 'manual')),\n  CHECK (\"state\" IN ('open', 'accepted', 'done', 'declined', 'withdrawn')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"team_id\") REFERENCES \"v2_pods\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_asks_team\" ON \"v2_asks\" (\"ws_id\" COLLATE BINARY ASC, \"team_id\" COLLATE BINARY ASC, \"state\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_asks_ws\" ON \"v2_asks\" (\"ws_id\" COLLATE BINARY ASC, \"updated_at\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_value_reports\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"change_request_id\" TEXT NOT NULL,\n  \"person_id\" TEXT NOT NULL,\n  \"estimate\" TEXT NOT NULL,\n  \"note\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"change_request_id\" COLLATE BINARY ASC, \"person_id\" COLLATE BINARY ASC),\n  CHECK (\"estimate\" IN ('same_day', 'two_to_three_days', 'about_a_week', 'longer', 'would_not_be_decided')),\n  CHECK ((\"note\" IS NULL) OR (length(\"note\") <= 500)),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"change_request_id\") REFERENCES \"v2_change_requests\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nDROP INDEX \"v2_events_actor\";\nDROP INDEX \"v2_events_name_at\";\nDROP INDEX \"v2_events_once_person\";\nDROP INDEX \"v2_events_once_ws\";\nDROP INDEX \"v2_events_ws\";\nCREATE INDEX \"v2_events_actor\" ON \"v2_events\" (\"actor\" COLLATE BINARY ASC) WHERE (\"actor\" IS NOT NULL);\nCREATE INDEX \"v2_events_name_at\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"at\" COLLATE BINARY ASC);\nCREATE UNIQUE INDEX \"v2_events_once_person\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC, \"actor\" COLLATE BINARY ASC) WHERE (((\"ws_id\" IS NOT NULL) AND (\"actor\" IS NOT NULL)) AND (\"name\" IN ('member_first_session_captured', 'value_card_viewed', 'value_reported', 'follow_up_clicked')));\nCREATE UNIQUE INDEX \"v2_events_once_ws\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC) WHERE ((\"ws_id\" IS NOT NULL) AND (\"name\" IN ('workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined', 'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed', 'first_ask', 'first_limit')));\nCREATE INDEX \"v2_events_ws\" ON \"v2_events\" (\"ws_id\" COLLATE BINARY ASC, \"name\" COLLATE BINARY ASC);\nALTER TABLE \"v2_goal_versions\" ADD COLUMN \"limits_json\" TEXT NOT NULL DEFAULT '[]';\nALTER TABLE \"v2_goals\" ADD COLUMN \"limits_json\" TEXT NOT NULL DEFAULT '[]';",
  "CREATE TABLE \"v2_goal_holds\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"held_by\" TEXT NOT NULL,\n  \"reason\" TEXT,\n  \"held_at\" TEXT NOT NULL,\n  \"directive_id\" TEXT,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC),\n  CHECK ((\"reason\" IS NULL) OR (length(\"reason\") <= 280)),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_request_targets\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"request_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"auto_accepted\" INTEGER NOT NULL DEFAULT 0,\n  \"updated_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"request_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('sent', 'received', 'accepted', 'declined', 'expired')),\n  CHECK (\"auto_accepted\" IN (0, 1)),\n  FOREIGN KEY (\"ws_id\", \"request_id\") REFERENCES \"v2_requests\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"session_key\") REFERENCES \"v2_sessions\" (\"ws_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_request_targets_key\" ON \"v2_request_targets\" (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_requests\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"type\" TEXT NOT NULL,\n  \"target_goal_id\" TEXT,\n  \"goal_version\" INTEGER NOT NULL,\n  \"note\" TEXT,\n  \"sender_id\" TEXT NOT NULL,\n  \"sender_role\" TEXT NOT NULL,\n  \"directive_id\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"cancelled_at\" TEXT,\n  \"cancelled_by\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"type\" IN ('replan', 'checkpoint', 'switch_goal')),\n  CHECK ((\"note\" IS NULL) OR (length(\"note\") <= 280)),\n  CHECK (\"sender_role\" IN ('approver', 'owner')),\n  CHECK ((\"type\" = 'switch_goal') = (\"target_goal_id\" IS NOT NULL)),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"target_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"directive_id\") REFERENCES \"v2_directives\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_requests_goal\" ON \"v2_requests\" (\"ws_id\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC, \"created_at\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_requests_sender\" ON \"v2_requests\" (\"sender_id\" COLLATE BINARY ASC, \"created_at\" COLLATE BINARY ASC);\nCREATE TABLE \"__saved_sequence\" AS SELECT name, seq FROM sqlite_sequence WHERE name = 'v2_directives';\nCREATE TABLE \"__next_v2_directives\" (\n  \"seq\" INTEGER PRIMARY KEY AUTOINCREMENT,\n  \"id\" TEXT NOT NULL,\n  \"ws_id\" TEXT NOT NULL,\n  \"kind\" TEXT NOT NULL,\n  \"goal_id\" TEXT,\n  \"goal_json\" TEXT,\n  \"binding_json\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  \"request_json\" TEXT,\n  \"hold_json\" TEXT,\n  UNIQUE (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"kind\" IN ('goal_version', 'binding_changed', 'binding_suspended', 'stop', 'resume', 'request', 'hold', 'release')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_directives\" (\"seq\", \"id\", \"ws_id\", \"kind\", \"goal_id\", \"goal_json\", \"binding_json\", \"created_at\") SELECT \"seq\", \"id\", \"ws_id\", \"kind\", \"goal_id\", \"goal_json\", \"binding_json\", \"created_at\" FROM \"v2_directives\";\nDROP TABLE \"v2_directives\";\nALTER TABLE \"__next_v2_directives\" RENAME TO \"v2_directives\";\nDELETE FROM sqlite_sequence WHERE name = 'v2_directives';\nINSERT INTO sqlite_sequence(name, seq) SELECT name, seq FROM \"__saved_sequence\";\nDROP TABLE \"__saved_sequence\";\nDROP INDEX \"v2_events_actor\";\nDROP INDEX \"v2_events_name_at\";\nDROP INDEX \"v2_events_once_person\";\nDROP INDEX \"v2_events_once_ws\";\nDROP INDEX \"v2_events_ws\";\nCREATE INDEX \"v2_events_actor\" ON \"v2_events\" (\"actor\" COLLATE BINARY ASC) WHERE (\"actor\" IS NOT NULL);\nCREATE INDEX \"v2_events_name_at\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"at\" COLLATE BINARY ASC);\nCREATE UNIQUE INDEX \"v2_events_once_person\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC, \"actor\" COLLATE BINARY ASC) WHERE (((\"ws_id\" IS NOT NULL) AND (\"actor\" IS NOT NULL)) AND (\"name\" IN ('member_first_session_captured', 'value_card_viewed', 'value_reported', 'follow_up_clicked')));\nCREATE UNIQUE INDEX \"v2_events_once_ws\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC) WHERE ((\"ws_id\" IS NOT NULL) AND (\"name\" IN ('workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined', 'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed', 'first_ask', 'first_limit', 'first_request', 'first_hold')));\nCREATE INDEX \"v2_events_ws\" ON \"v2_events\" (\"ws_id\" COLLATE BINARY ASC, \"name\" COLLATE BINARY ASC);\nCREATE TABLE \"__next_v2_receipts\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"directive_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"at\" TEXT NOT NULL,\n  \"recorded_at\" TEXT NOT NULL,\n  \"auto_accepted\" INTEGER NOT NULL DEFAULT 0,\n  PRIMARY KEY (\"directive_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC, \"state\" COLLATE BINARY ASC, \"auto_accepted\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('received', 'applied', 'enforced', 'accepted', 'declined')),\n  CHECK ((\"auto_accepted\" IN (0, 1)) AND ((\"auto_accepted\" = 0) OR (\"state\" = 'accepted'))),\n  FOREIGN KEY (\"ws_id\", \"directive_id\", \"session_key\") REFERENCES \"v2_directive_targets\" (\"ws_id\", \"directive_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_receipts\" (\"rowid\", \"ws_id\", \"directive_id\", \"session_key\", \"state\", \"at\", \"recorded_at\") SELECT \"rowid\", \"ws_id\", \"directive_id\", \"session_key\", \"state\", \"at\", \"recorded_at\" FROM \"v2_receipts\";\nDROP TABLE \"v2_receipts\";\nALTER TABLE \"__next_v2_receipts\" RENAME TO \"v2_receipts\";",
  "CREATE TABLE \"__next_v2_change_request_revisions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"change_request_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"base_version\" INTEGER NOT NULL,\n  \"changes_json\" TEXT NOT NULL,\n  \"note\" TEXT,\n  \"author_id\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"snapshot_json\" TEXT,\n  \"condition\" TEXT,\n  \"acknowledged_by\" TEXT,\n  \"acknowledged_at\" TEXT,\n  PRIMARY KEY (\"change_request_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC),\n  CHECK ((\"condition\" IS NULL) OR (length(\"condition\") BETWEEN 1 AND 2000)),\n  FOREIGN KEY (\"ws_id\", \"change_request_id\") REFERENCES \"v2_change_requests\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_change_request_revisions\" (\"rowid\", \"ws_id\", \"change_request_id\", \"revision\", \"base_version\", \"changes_json\", \"note\", \"author_id\", \"created_at\", \"snapshot_json\") SELECT \"rowid\", \"ws_id\", \"change_request_id\", \"revision\", \"base_version\", \"changes_json\", \"note\", \"author_id\", \"created_at\", \"snapshot_json\" FROM \"v2_change_request_revisions\";\nDROP TABLE \"v2_change_request_revisions\";\nALTER TABLE \"__next_v2_change_request_revisions\" RENAME TO \"v2_change_request_revisions\";\nCREATE TABLE \"__next_v2_change_requests\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"requester_id\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"base_version\" INTEGER NOT NULL,\n  \"changes_json\" TEXT NOT NULL,\n  \"reason\" TEXT NOT NULL,\n  \"approved_by\" TEXT,\n  \"rejected_by\" TEXT,\n  \"decision_note\" TEXT,\n  \"version\" INTEGER,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"decided_at\" TEXT,\n  \"approved_without_evidence\" INTEGER,\n  \"launch\" TEXT,\n  \"approved_json\" TEXT,\n  \"launch_by\" TEXT,\n  \"launch_at\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('pending', 'countered', 'approved', 'rejected', 'withdrawn', 'superseded')),\n  CHECK ((\"launch\" IS NULL) OR (\"launch\" IN ('pending', 'not_yet', 'launched', 'superseded'))),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_change_requests\" (\"rowid\", \"id\", \"ws_id\", \"goal_id\", \"requester_id\", \"state\", \"revision\", \"base_version\", \"changes_json\", \"reason\", \"approved_by\", \"rejected_by\", \"decision_note\", \"version\", \"created_at\", \"updated_at\", \"decided_at\", \"approved_without_evidence\") SELECT \"rowid\", \"id\", \"ws_id\", \"goal_id\", \"requester_id\", \"state\", \"revision\", \"base_version\", \"changes_json\", \"reason\", \"approved_by\", \"rejected_by\", \"decision_note\", \"version\", \"created_at\", \"updated_at\", \"decided_at\", \"approved_without_evidence\" FROM \"v2_change_requests\";\nDROP TABLE \"v2_change_requests\";\nALTER TABLE \"__next_v2_change_requests\" RENAME TO \"v2_change_requests\";\nCREATE INDEX \"v2_change_requests_goal\" ON \"v2_change_requests\" (\"ws_id\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC);\nCREATE UNIQUE INDEX \"v2_change_requests_open\" ON \"v2_change_requests\" (\"goal_id\" COLLATE BINARY ASC, \"requester_id\" COLLATE BINARY ASC) WHERE (\"state\" IN ('pending', 'countered'));\nDROP INDEX \"v2_events_actor\";\nDROP INDEX \"v2_events_name_at\";\nDROP INDEX \"v2_events_once_person\";\nDROP INDEX \"v2_events_once_ws\";\nDROP INDEX \"v2_events_ws\";\nCREATE INDEX \"v2_events_actor\" ON \"v2_events\" (\"actor\" COLLATE BINARY ASC) WHERE (\"actor\" IS NOT NULL);\nCREATE INDEX \"v2_events_name_at\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"at\" COLLATE BINARY ASC);\nCREATE UNIQUE INDEX \"v2_events_once_person\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC, \"actor\" COLLATE BINARY ASC) WHERE (((\"ws_id\" IS NOT NULL) AND (\"actor\" IS NOT NULL)) AND (\"name\" IN ('member_first_session_captured', 'value_card_viewed', 'value_reported', 'follow_up_clicked')));\nCREATE UNIQUE INDEX \"v2_events_once_ws\" ON \"v2_events\" (\"name\" COLLATE BINARY ASC, \"ws_id\" COLLATE BINARY ASC) WHERE ((\"ws_id\" IS NOT NULL) AND (\"name\" IN ('workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined', 'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed', 'first_ask', 'first_limit', 'first_request', 'first_hold', 'first_launch')));\nCREATE INDEX \"v2_events_ws\" ON \"v2_events\" (\"ws_id\" COLLATE BINARY ASC, \"name\" COLLATE BINARY ASC);\nUPDATE \"v2_change_requests\" SET \"launch\" = 'launched', \"launch_by\" = \"approved_by\", \"launch_at\" = \"decided_at\" WHERE \"state\" = 'approved';",
  "ALTER TABLE \"v2_oauth_grants\" ADD COLUMN \"last_read_at\" TEXT;",
  "CREATE TABLE \"v2_reallocation_approvals\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"reallocation_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"at\" TEXT NOT NULL,\n  PRIMARY KEY (\"reallocation_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\", \"reallocation_id\") REFERENCES \"v2_reallocations\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_reallocation_revisions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"reallocation_id\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"targets_json\" TEXT NOT NULL,\n  \"note\" TEXT,\n  \"author_id\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"reallocation_id\" COLLATE BINARY ASC, \"revision\" COLLATE BINARY ASC),\n  CHECK ((\"note\" IS NULL) OR (length(\"note\") <= 1000)),\n  FOREIGN KEY (\"ws_id\", \"reallocation_id\") REFERENCES \"v2_reallocations\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE TABLE \"v2_reallocations\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"requester_id\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"revision\" INTEGER NOT NULL,\n  \"launch\" TEXT,\n  \"launch_by\" TEXT,\n  \"launch_at\" TEXT,\n  \"decided_by\" TEXT,\n  \"decision_note\" TEXT,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"decided_at\" TEXT,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('pending', 'countered', 'approved', 'rejected', 'withdrawn', 'superseded')),\n  CHECK ((\"launch\" IS NULL) OR (\"launch\" IN ('pending', 'not_yet', 'launched', 'superseded'))),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_reallocations_ws\" ON \"v2_reallocations\" (\"ws_id\" COLLATE BINARY ASC, \"updated_at\" COLLATE BINARY ASC);\nCREATE TABLE \"v2_steering_events\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"suggested_goal_id\" TEXT NOT NULL,\n  \"share\" INTEGER NOT NULL,\n  \"target\" INTEGER NOT NULL,\n  \"at\" TEXT NOT NULL,\n  \"recorded_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC, \"at\" COLLATE BINARY ASC),\n  CHECK (\"share\" BETWEEN 0 AND 100),\n  CHECK (\"target\" BETWEEN 0 AND 100),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"session_key\") REFERENCES \"v2_sessions\" (\"ws_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_steering_events_at\" ON \"v2_steering_events\" (\"ws_id\" COLLATE BINARY ASC, \"at\" COLLATE BINARY ASC);\nCREATE TABLE \"__next_v2_goal_versions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"version\" INTEGER NOT NULL,\n  \"title\" TEXT NOT NULL,\n  \"measures_json\" TEXT NOT NULL,\n  \"anchors_json\" TEXT NOT NULL,\n  \"status\" TEXT NOT NULL,\n  \"content_hash\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"depends_on_json\" TEXT NOT NULL DEFAULT '[]',\n  \"limits_json\" TEXT NOT NULL DEFAULT '[]',\n  \"target_share\" INTEGER,\n  PRIMARY KEY (\"goal_id\" COLLATE BINARY ASC, \"version\" COLLATE BINARY ASC),\n  CHECK ((\"target_share\" IS NULL) OR (\"target_share\" BETWEEN 0 AND 100)),\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_goal_versions\" (\"rowid\", \"ws_id\", \"goal_id\", \"version\", \"title\", \"measures_json\", \"anchors_json\", \"status\", \"content_hash\", \"created_by\", \"created_at\", \"depends_on_json\", \"limits_json\") SELECT \"rowid\", \"ws_id\", \"goal_id\", \"version\", \"title\", \"measures_json\", \"anchors_json\", \"status\", \"content_hash\", \"created_by\", \"created_at\", \"depends_on_json\", \"limits_json\" FROM \"v2_goal_versions\";\nDROP TABLE \"v2_goal_versions\";\nALTER TABLE \"__next_v2_goal_versions\" RENAME TO \"v2_goal_versions\";\nCREATE TABLE \"__next_v2_goals\" (\n  \"id\" TEXT,\n  \"ws_id\" TEXT NOT NULL,\n  \"owner_id\" TEXT NOT NULL,\n  \"pod_id\" TEXT,\n  \"visibility\" TEXT NOT NULL,\n  \"version\" INTEGER NOT NULL,\n  \"title\" TEXT NOT NULL,\n  \"measures_json\" TEXT NOT NULL,\n  \"anchors_json\" TEXT NOT NULL,\n  \"status\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"depends_on_json\" TEXT NOT NULL DEFAULT '[]',\n  \"level\" TEXT NOT NULL DEFAULT 'team',\n  \"limits_json\" TEXT NOT NULL DEFAULT '[]',\n  \"target_share\" INTEGER,\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  UNIQUE (\"ws_id\" COLLATE BINARY ASC, \"id\" COLLATE BINARY ASC),\n  CHECK (\"visibility\" IN ('private', 'pod', 'workspace')),\n  CHECK (\"status\" IN ('active', 'achieved', 'dropped')),\n  CHECK (\"level\" IN ('company', 'team')),\n  CHECK ((\"target_share\" IS NULL) OR (\"target_share\" BETWEEN 0 AND 100)),\n  CHECK ((\"visibility\" <> 'pod') OR (\"pod_id\" IS NOT NULL)),\n  CHECK ((\"level\" <> 'company') OR ((\"pod_id\" IS NULL) AND (\"visibility\" = 'workspace'))),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"pod_id\") REFERENCES \"v2_pods\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_goals\" (\"rowid\", \"id\", \"ws_id\", \"owner_id\", \"pod_id\", \"visibility\", \"version\", \"title\", \"measures_json\", \"anchors_json\", \"status\", \"created_at\", \"updated_at\", \"depends_on_json\", \"level\", \"limits_json\") SELECT \"rowid\", \"id\", \"ws_id\", \"owner_id\", \"pod_id\", \"visibility\", \"version\", \"title\", \"measures_json\", \"anchors_json\", \"status\", \"created_at\", \"updated_at\", \"depends_on_json\", \"level\", \"limits_json\" FROM \"v2_goals\";\nDROP TABLE \"v2_goals\";\nALTER TABLE \"__next_v2_goals\" RENAME TO \"v2_goals\";\nCREATE INDEX \"v2_goals_ws\" ON \"v2_goals\" (\"ws_id\" COLLATE BINARY ASC);\nCREATE TABLE \"__next_v2_workspaces\" (\n  \"id\" TEXT,\n  \"name\" TEXT NOT NULL,\n  \"created_by\" TEXT NOT NULL,\n  \"created_at\" TEXT NOT NULL,\n  \"deleted_at\" TEXT,\n  \"steering\" TEXT NOT NULL DEFAULT 'off',\n  PRIMARY KEY (\"id\" COLLATE BINARY ASC),\n  CHECK (\"steering\" IN ('off', 'on'))\n);\nINSERT INTO \"__next_v2_workspaces\" (\"rowid\", \"id\", \"name\", \"created_by\", \"created_at\", \"deleted_at\") SELECT \"rowid\", \"id\", \"name\", \"created_by\", \"created_at\", \"deleted_at\" FROM \"v2_workspaces\";\nDROP TABLE \"v2_workspaces\";\nALTER TABLE \"__next_v2_workspaces\" RENAME TO \"v2_workspaces\";",
  "CREATE TABLE \"__next_v2_sessions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"device_id\" TEXT,\n  \"harness\" TEXT NOT NULL,\n  \"repo_key\" TEXT NOT NULL,\n  \"repo_alias\" TEXT,\n  \"title\" TEXT,\n  \"started_at\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"stopped_at\" TEXT,\n  \"governing_goal_id\" TEXT,\n  \"governing_alignment_id\" TEXT,\n  \"agent_stopped\" INTEGER NOT NULL DEFAULT 0,\n  \"conflicts\" INTEGER NOT NULL DEFAULT 0,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"ended_reason\" TEXT,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  CHECK (\"harness\" IN ('claude-code', 'codex')),\n  CHECK (\"state\" IN ('shared', 'suspended', 'stopped')),\n  CHECK ((\"ended_reason\" IS NULL) OR (\"ended_reason\" = 'device_signed_out')),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"device_id\") REFERENCES \"v2_devices\" (\"id\") ON DELETE SET NULL ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_alignment_id\") REFERENCES \"v2_alignments\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_sessions\" (\"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\") SELECT \"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\" FROM \"v2_sessions\";\nDROP TABLE \"v2_sessions\";\nALTER TABLE \"__next_v2_sessions\" RENAME TO \"v2_sessions\";\nCREATE INDEX \"v2_sessions_device\" ON \"v2_sessions\" (\"device_id\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_sessions_user\" ON \"v2_sessions\" (\"ws_id\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC);",
  "CREATE TABLE \"__next_v2_sessions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"user_id\" TEXT NOT NULL,\n  \"device_id\" TEXT,\n  \"harness\" TEXT NOT NULL,\n  \"repo_key\" TEXT NOT NULL,\n  \"repo_alias\" TEXT,\n  \"title\" TEXT,\n  \"started_at\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"stopped_at\" TEXT,\n  \"governing_goal_id\" TEXT,\n  \"governing_alignment_id\" TEXT,\n  \"agent_stopped\" INTEGER NOT NULL DEFAULT 0,\n  \"conflicts\" INTEGER NOT NULL DEFAULT 0,\n  \"created_at\" TEXT NOT NULL,\n  \"updated_at\" TEXT NOT NULL,\n  \"ended_reason\" TEXT,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  CHECK (\"harness\" IN ('claude-code', 'codex')),\n  CHECK (\"state\" IN ('shared', 'suspended', 'stopped')),\n  CHECK ((\"ended_reason\" IS NULL) OR (\"ended_reason\" IN ('device_signed_out', 'member_removed'))),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"device_id\") REFERENCES \"v2_devices\" (\"id\") ON DELETE SET NULL ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"governing_alignment_id\") REFERENCES \"v2_alignments\" (\"ws_id\", \"id\") ON DELETE NO ACTION ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_sessions\" (\"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\", \"ended_reason\") SELECT \"rowid\", \"ws_id\", \"session_key\", \"user_id\", \"device_id\", \"harness\", \"repo_key\", \"repo_alias\", \"title\", \"started_at\", \"state\", \"stopped_at\", \"governing_goal_id\", \"governing_alignment_id\", \"agent_stopped\", \"conflicts\", \"created_at\", \"updated_at\", \"ended_reason\" FROM \"v2_sessions\";\nDROP TABLE \"v2_sessions\";\nALTER TABLE \"__next_v2_sessions\" RENAME TO \"v2_sessions\";\nCREATE INDEX \"v2_sessions_device\" ON \"v2_sessions\" (\"device_id\" COLLATE BINARY ASC);\nCREATE INDEX \"v2_sessions_user\" ON \"v2_sessions\" (\"ws_id\" COLLATE BINARY ASC, \"user_id\" COLLATE BINARY ASC);",
  "CREATE TABLE \"__next_v2_request_targets\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"request_id\" TEXT NOT NULL,\n  \"session_key\" TEXT NOT NULL,\n  \"state\" TEXT NOT NULL,\n  \"auto_accepted\" INTEGER NOT NULL DEFAULT 0,\n  \"updated_at\" TEXT NOT NULL,\n  \"ended_reason\" TEXT,\n  PRIMARY KEY (\"request_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC),\n  CHECK (\"state\" IN ('sent', 'received', 'accepted', 'declined', 'expired')),\n  CHECK (\"auto_accepted\" IN (0, 1)),\n  CHECK ((\"ended_reason\" IS NULL) OR (\"ended_reason\" IN ('device_signed_out', 'member_removed'))),\n  FOREIGN KEY (\"ws_id\", \"request_id\") REFERENCES \"v2_requests\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"session_key\") REFERENCES \"v2_sessions\" (\"ws_id\", \"session_key\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nINSERT INTO \"__next_v2_request_targets\" (\"rowid\", \"ws_id\", \"request_id\", \"session_key\", \"state\", \"auto_accepted\", \"updated_at\") SELECT \"rowid\", \"ws_id\", \"request_id\", \"session_key\", \"state\", \"auto_accepted\", \"updated_at\" FROM \"v2_request_targets\";\nDROP TABLE \"v2_request_targets\";\nALTER TABLE \"__next_v2_request_targets\" RENAME TO \"v2_request_targets\";\nCREATE INDEX \"v2_request_targets_key\" ON \"v2_request_targets\" (\"ws_id\" COLLATE BINARY ASC, \"session_key\" COLLATE BINARY ASC);",
  "CREATE TABLE \"v2_deleted_sessions\" (\n  \"ws_id\" TEXT NOT NULL,\n  \"key_hash\" TEXT NOT NULL,\n  \"deleted_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"ws_id\" COLLATE BINARY ASC, \"key_hash\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"ws_id\") REFERENCES \"v2_workspaces\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);",
  "ALTER TABLE \"v2_device_requests\" ADD COLUMN \"approved_name\" TEXT;",
  "ALTER TABLE \"v2_devices\" ADD COLUMN \"replaces\" TEXT;",
  "CREATE TABLE \"v2_oauth_goal_sends\" (\n  \"grant_id\" TEXT NOT NULL,\n  \"ws_id\" TEXT NOT NULL,\n  \"goal_id\" TEXT NOT NULL,\n  \"version\" INTEGER NOT NULL,\n  \"sent_at\" TEXT NOT NULL,\n  PRIMARY KEY (\"grant_id\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC, \"version\" COLLATE BINARY ASC),\n  FOREIGN KEY (\"grant_id\") REFERENCES \"v2_oauth_grants\" (\"id\") ON DELETE CASCADE ON UPDATE NO ACTION,\n  FOREIGN KEY (\"ws_id\", \"goal_id\") REFERENCES \"v2_goals\" (\"ws_id\", \"id\") ON DELETE CASCADE ON UPDATE NO ACTION\n);\nCREATE INDEX \"v2_oauth_goal_sends_goal\" ON \"v2_oauth_goal_sends\" (\"ws_id\" COLLATE BINARY ASC, \"goal_id\" COLLATE BINARY ASC, \"version\" COLLATE BINARY ASC);"
]);

function change_programs() {
  return programs.slice();
}

module.exports = { change_programs };


};

// Private verifier module: /__private__/storage-event-integrity/qualified-refresh23.cjs
modules["/__private__/storage-event-integrity/qualified-refresh23.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';

function extend_device_refresh_schema(programs) {
  const result = [];
  for (let i = 0; i < programs.length; i += 1) {
    result.push(programs[i]);
  }
  result.push('ALTER TABLE v2_device_tokens ADD COLUMN rotated_ts TEXT;\nALTER TABLE v2_device_tokens ADD COLUMN used_at TEXT;');
  return result;
}

module.exports = { extend_device_refresh_schema };

};

// Private verifier module: /__private__/storage-event-integrity/schema-observations.cjs
modules["/__private__/storage-event-integrity/schema-observations.cjs"] = function(require,module,exports,__filename,__dirname) {
const MODELER_SOURCE="\"use strict\";\n// Independent observer code. Excluded from native candidate generation.\nconst assert = require(\"node:assert/strict\");\nconst KEYWORDS = new Set(\"CHECK OR AND IS NOT NULL IN BETWEEN STRICT WITHOUT AUTOINCREMENT CREATE TRIGGER BEFORE UPDATE OF ON BEGIN SELECT RAISE ABORT END WHERE DEFERRABLE INITIALLY CONFLICT GENERATED VIRTUAL COLLATE PRIMARY KEY FOREIGN UNIQUE REFERENCES DEFAULT TABLE CONSTRAINT\".split(\" \"));\nfunction tokens(text) {\n  const out=[];let at=0;\n  while(at<text.length) {\n    if(/\\s/.test(text[at])){at++;continue;}\n    if(text.startsWith(\"--\",at)){const end=text.indexOf(\"\\n\",at);at=end<0?text.length:end+1;continue;}\n    if(text.startsWith(\"/*\",at)){const end=text.indexOf(\"*/\",at+2);assert(end>=0,\"Unterminated comment\");at=end+2;continue;}\n    const quote=text[at];\n    if(quote===\"'\"||quote==='\"') {\n      at++;let value=\"\",closed=false;\n      while(at<text.length){if(text[at]===quote){at++;if(text[at]===quote){value+=quote;at++;continue;}closed=true;break;}value+=text[at++];}\n      assert(closed,\"Unterminated quoted value\");out.push([quote===\"'\"?\"literal\":\"name\",value]);continue;\n    }\n    const match=/^(?:[A-Za-z_][A-Za-z_0-9]*|\\d+|<>|!=|<=|>=|[(),;=<>+*.\\-])/.exec(text.slice(at));\n    assert(match,\"Unsupported target token\");const value=match[0];out.push([/^\\d+$/.test(value)?\"integer\":\"word\",KEYWORDS.has(value.toUpperCase())?value.toUpperCase():value]);at+=value.length;\n  }\n  return out;\n}\nclass Expression {\n  constructor(items){this.items=items;this.at=0;}\n  is(word){const t=this.items[this.at];return t?.[0]===\"word\"&&t[1]===word;}\n  take(word){assert(this.is(word),\"Expected \"+word);this.at++;}\n  parse(){const result=this.or();assert.equal(this.at,this.items.length,\"Unconsumed expression\");return result;}\n  or(){let value=this.and();while(this.is(\"OR\")){this.at++;value={op:\"or\",args:[value,this.and()]};}return value;}\n  and(){let value=this.compare();while(this.is(\"AND\")){this.at++;value={op:\"and\",args:[value,this.compare()]};}return value;}\n  compare(){\n    const value=this.primary();\n    if(this.is(\"IS\")){this.at++;const inverse=this.is(\"NOT\");if(inverse)this.at++;this.take(\"NULL\");return {op:inverse?\"is_not_null\":\"is_null\",arg:value};}\n    if(this.is(\"IN\")){this.at++;this.take(\"(\");const choices=[this.primary()];while(this.is(\",\")){this.at++;choices.push(this.primary());}this.take(\")\");return {op:\"in\",arg:value,choices};}\n    if(this.is(\"BETWEEN\")){this.at++;const low=this.primary();this.take(\"AND\");return {op:\"between\",arg:value,low,high:this.primary()};}\n    for(const [spelling,op] of [[\"=\",\"equal\"],[\"<>\",\"not_equal\"],[\"!=\",\"not_equal\"],[\"<=\",\"at_most\"],[\">=\",\"at_least\"],[\"<\",\"less_than\"],[\">\",\"greater_than\"]])if(this.is(spelling)){this.at++;return {op,args:[value,this.primary()]};}\n    return value;\n  }\n  primary(){\n    if(this.is(\"(\")){this.at++;const value=this.or();this.take(\")\");return value;}\n    if(this.is(\"-\")){this.at++;const value=this.primary();assert(Number.isInteger(value.literal));return {literal:-value.literal};}\n    const item=this.items[this.at++];assert(item,\"Missing expression operand\");const [kind,value]=item;\n    if(kind===\"literal\")return {literal:value};if(kind===\"integer\")return {literal:Number(value)};\n    if(kind===\"word\"&&value===\"NULL\")return {literal:null};\n    assert([\"word\",\"name\"].includes(kind)&&/^[A-Za-z_][A-Za-z_0-9]*$/.test(value),\"Unsupported expression operand\");\n    if(this.is(\"(\")){assert([\"length\",\"json_valid\",\"json_type\"].includes(value.toLowerCase()),\"Unsupported target function\");this.at++;const arg=this.or();this.take(\")\");return {function:value.toLowerCase(),args:[arg]};}\n    return {field:value};\n  }\n}\nfunction checks(sql) {\n  const source=tokens(sql),found=[];\n  for(let at=0;at<source.length;at++) {\n    if(source[at][0]!==\"word\"||source[at][1]!==\"CHECK\")continue;\n    assert.deepEqual(source[++at],[\"word\",\"(\"]);const begin=++at;let depth=1;\n    for(;at<source.length;at++){if(source[at][0]===\"word\"&&source[at][1]===\"(\")depth++;else if(source[at][0]===\"word\"&&source[at][1]===\")\"&&--depth===0)break;}\n    assert.equal(depth,0);found.push(new Expression(source.slice(begin,at)).parse());\n  }\n  return found;\n}\nfunction indexModel(index) {\n  const source=index.sql?tokens(index.sql):[],where=source.findIndex(t=>t[0]===\"word\"&&t[1]===\"WHERE\"),items=where<0?[]:source.slice(where+1);\n  if(items.at(-1)?.[1]===\";\")items.pop();assert.equal(!!items.length,!!index.partial);\n  const fields=index.columns.filter(f=>f.key).map(f=>{assert(f.name!==null&&f.cid>=0,\"Unmodeled expression index\");return {name:f.name,descending:!!f.desc,collation:f.coll};});\n  return {name:index.name,unique:!!index.unique,origin:index.origin,fields,when:items.length?new Expression(items).parse():null};\n}\nfunction triggerModel(trigger) {\n  const source=tokens(trigger.sql),expected=[\"CREATE\",\"TRIGGER\",\"v2_events_append_only\",\"BEFORE\",\"UPDATE\",\"OF\",\"id\",\",\",\"name\",\",\",\"at\",\",\",\"props\",\"ON\",\"v2_events\",\"BEGIN\",\"SELECT\",\"RAISE\",\"(\",\"ABORT\",\",\",\"v2_events is append-only\",\")\",\";\",\"END\"];\n  assert.deepEqual(source.map(t=>t[1]),expected,\"Unreviewed trigger shape\");assert.equal(source[21][0],\"literal\");\n  return {name:trigger.name,before:\"update\",fields:[\"id\",\"name\",\"at\",\"props\"],effect:\"abort_statement\",message:\"v2_events is append-only\",fires_when_values_unchanged:true};\n}\nfunction tableModel(table) {\n  const columns=table.columns.map(c=>{assert(!c.hidden&&[\"INTEGER\",\"TEXT\"].includes(c.type),\"Unmodeled column type\");return {name:c.name,affinity:c.type.toLowerCase(),explicit_not_null:!!c.notnull,primary_key_position:c.pk,default:c.dflt_value===null?{absent:true}:new Expression(tokens(c.dflt_value)).parse()};});\n  const grouped=new Map();for(const f of table.foreign_keys){if(!grouped.has(f.id))grouped.set(f.id,[]);grouped.get(f.id).push(f);}\n  const references=[...grouped].sort((a,b)=>a[0]-b[0]).map(([id,group])=>{\n    group.sort((a,b)=>a.seq-b.seq);const first=group[0];for(const key of [\"table\",\"on_update\",\"on_delete\",\"match\"])assert(group.every(f=>f[key]===first[key]));\n    return {introspection_id:id,from:group.map(f=>f.from),table:first.table,to:group.map(f=>f.to),on_delete:first.on_delete.toLowerCase().replaceAll(\" \",\"_\"),on_update:first.on_update.toLowerCase().replaceAll(\" \",\"_\"),match:first.match};\n  });\n  const primary=table.columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);\n  const indexes=table.indexes.map(indexModel);\n  const rowidAlias=primary.length===1&&columns.find(c=>c.name===primary[0]).affinity===\"integer\"&&!indexes.some(i=>i.origin===\"pk\")?primary[0]:null;\n  const source=tokens(table.sql),has=word=>source.some(t=>t[0]===\"word\"&&t[1]===word),automatic=has(\"AUTOINCREMENT\");\n  for(const word of [\"DEFERRABLE\",\"INITIALLY\",\"CONFLICT\",\"GENERATED\",\"VIRTUAL\",\"STRICT\",\"WITHOUT\"])assert(!has(word),\"Unmodeled table clause \"+word);\n  for(let i=0;i<source.length;i++)if(source[i][0]===\"word\"&&source[i][1]===\"COLLATE\")assert.equal(source[i+1]?.[1].toUpperCase(),\"BINARY\",\"Unmodeled table collation\");\n  assert(!automatic||rowidAlias!==null);\n  return {name:table.name,strict:false,rowid_table:true,rowid_alias:rowidAlias,non_reusing_sequence:automatic,columns,primary_key:primary,checks:checks(table.sql),references,indexes,triggers:table.triggers.map(triggerModel)};\n}\nconst q=s=>'\"'+s.replaceAll('\"','\"\"')+'\"';\nconst order=(a,b)=>a.name<b.name?-1:a.name>b.name?1:0;\nfunction observe(db) {\n  return db.prepare(\"SELECT name,sql FROM sqlite_schema WHERE type='table' AND name LIKE 'v2_%' ORDER BY name\").all().map(t=>({...t,\n    columns:db.prepare(`PRAGMA table_xinfo(${q(t.name)})`).all(),foreign_keys:db.prepare(`PRAGMA foreign_key_list(${q(t.name)})`).all(),\n    indexes:db.prepare(`PRAGMA index_list(${q(t.name)})`).all().sort(order).map(i=>({...i,sql:db.prepare(\"SELECT sql FROM sqlite_schema WHERE type='index' AND name=?\").get(i.name)?.sql??null,columns:db.prepare(`PRAGMA index_xinfo(${q(i.name)})`).all()})),\n    triggers:db.prepare(\"SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name=? ORDER BY name\").all(t.name)\n  }));\n}\nfunction stable(value){return JSON.stringify(value,(_k,x)=>x&&typeof x===\"object\"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);}\nmodule.exports={tokens,Expression,checks,indexModel,triggerModel,tableModel,observe,q,stable};\nif(require.main===module){const fs=require(\"node:fs\"),[input,output]=process.argv.slice(2);assert(input&&output);const inventory=JSON.parse(fs.readFileSync(input,\"utf8\"));const snapshots=inventory.snapshots.map(s=>({version:s.version,tables:s.tables.map(tableModel)}));fs.writeFileSync(output,JSON.stringify({snapshots})+\"\\n\",{flag:\"wx\"});console.log(JSON.stringify({versions:snapshots.length,output}));}\n";
const SEED_SOURCE="\"use strict\";\n// Synthetic records for isolated storage acceptance only.\nconst assert = require(\"node:assert/strict\");\nmodule.exports = function storageFixtures(inventory) {\nconst T=\"2026-01-01T00:00:00.000Z\", LATER=\"2026-02-01T00:00:00.000Z\";\nconst identifier=n=>'\"'+n.replaceAll('\"','\"\"')+'\"';\nconst stable=value=>JSON.stringify(value,(_key,x)=>x&&typeof x===\"object\"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);\nfunction rows(db,table,columns) {\n  return db.prepare(`SELECT ${columns.map(identifier).join(\",\")} FROM ${identifier(table)}`).all().map(r=>JSON.parse(JSON.stringify(r))).sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0);\n}\nfunction seed(db,version) {\n  const tables=new Map(inventory.snapshots[version].tables.map(t=>[t.name,t]));\n  const added=new Map();\n  function add(name,data) {\n    const table=tables.get(name);if(!table)return;\n    const keys=table.columns.map(c=>c.name).filter(k=>Object.hasOwn(data,k)&&data[k]!==undefined);\n    for(const c of table.columns)if(c.notnull&&c.dflt_value===null&&!keys.includes(c.name))throw new Error(\"Missing explicit fixture field \"+name+\".\"+c.name);\n    db.prepare(`INSERT INTO ${identifier(name)} (${keys.map(identifier).join(\",\")}) VALUES (${keys.map(()=>\"?\").join(\",\")})`).run(...keys.map(k=>data[k]));\n    added.set(name,(added.get(name)||0)+1);\n  }\n  for(const s of [\"a\",\"b\"]) {\n    const ws=\"fixture-ws-\"+s,owner=\"fixture-owner-\"+s,member=\"fixture-member-\"+s,viewer=\"fixture-viewer-\"+s;\n    const pod=\"fixture-pod-\"+s,goal=\"fixture-goal-\"+s,other=\"fixture-other-goal-\"+s,source=\"fixture-source-goal-\"+s;\n    const device=\"fixture-device-\"+s,session=\"fixture-session-\"+s,alignment=\"fixture-alignment-\"+s;\n    const directive=\"fixture-directive-\"+s,requestDirective=\"fixture-request-directive-\"+s,holdDirective=\"fixture-hold-directive-\"+s;\n    const epoch=\"fixture-epoch-\"+s,grant=\"fixture-grant-\"+s,request=\"fixture-request-\"+s,reallocation=\"fixture-reallocation-\"+s;\n    const approvedCR=\"fixture-change-approved-\"+s,ask=\"fixture-ask-\"+s,seq=(s===\"a\"?10:20);\n    for(const user of [owner,member,viewer])db.prepare(\"INSERT INTO ba_user(id) VALUES(?)\").run(user);\n    db.prepare(\"INSERT INTO ba_passkey(id) VALUES(?)\").run(\"fixture-passkey-\"+s);\n    add(\"v2_workspaces\",{id:ws,name:\"Fixture workspace \"+s,created_by:owner,created_at:T,deleted_at:null,steering:\"on\"});\n    for(const [user,role] of [[owner,\"owner\"],[member,\"member\"],[viewer,\"viewer\"]])add(\"v2_members\",{ws_id:ws,user_id:user,role,created_at:T});\n    add(\"v2_pods\",{id:pod,ws_id:ws,name:\"Fixture team \"+s,created_at:T});\n    add(\"v2_pod_members\",{ws_id:ws,pod_id:pod,user_id:owner,role:\"lead\",created_at:T});\n    add(\"v2_pod_members\",{ws_id:ws,pod_id:pod,user_id:member,role:\"member\",created_at:T});\n    add(\"v2_invites\",{id:\"fixture-invite-\"+s,ws_id:ws,token_hash:\"fixture-invite-hash-\"+s,email:\"invite-\"+s+\"@fixture.invalid\",role:\"member\",created_by:owner,created_at:T,expires_at:LATER,accepted_at:null,accepted_by:null,team_id:pod,team_role:\"member\"});\n    for(const [id,user] of [[goal,owner],[other,owner],[source,member]]) {\n      add(\"v2_goals\",{id,ws_id:ws,owner_id:user,pod_id:pod,visibility:\"workspace\",version:1,title:\"Fixture caf\u00e9 \"+id,measures_json:'[{\"id\":\"fixture-measure\",\"text\":\"Keep bytes\"}]',anchors_json:'[\"fixture-anchor\"]',status:\"active\",created_at:T,updated_at:LATER,depends_on_json:\"[]\",level:\"team\",limits_json:'[{\"id\":\"fixture-limit\",\"value\":5}]',target_share:40});\n      add(\"v2_goal_versions\",{ws_id:ws,goal_id:id,version:1,title:\"Fixture caf\u00e9 \"+id,measures_json:'[{\"id\":\"fixture-measure\",\"text\":\"Keep bytes\"}]',anchors_json:'[\"fixture-anchor\"]',status:\"active\",content_hash:\"fixture-content-hash-\"+id,created_by:user,created_at:T,depends_on_json:\"[]\",limits_json:'[{\"id\":\"fixture-limit\",\"value\":5}]',target_share:40});\n    }\n    add(\"v2_goal_acks\",{ws_id:ws,goal_id:source,parent_id:goal,parent_version:1,at:T});\n    add(\"v2_audit\",{seq:seq+1,ws_id:ws,actor_id:owner,action:\"fixture.action\",object_id:goal,at:T});\n    add(\"v2_devices\",{id:device,user_id:member,name:\"Fixture machine \"+s,public_key:\"fixture-public-key-\"+s,created_at:T,last_seen_at:LATER,revoked_at:null,revoked_reason:null,replaces:\"fixture-prior-device-\"+s});\n    add(\"v2_device_requests\",{id:\"fixture-device-request-\"+s,device_code_hash:\"fixture-device-code-hash-\"+s,user_code:\"FIXTURE-\"+s.toUpperCase(),device_name:\"Fixture machine \"+s,public_key:\"fixture-public-key-\"+s,created_at:T,expires_at:LATER,interval_s:5,last_poll_at:T,state:\"approved\",user_id:member,ws_ids_json:JSON.stringify([ws]),device_id:device,approved_name:\"Fixture approved machine \"+s});\n    add(\"v2_device_grants\",{device_id:device,ws_id:ws});\n    for(const kind of [\"access\",\"refresh\"])add(\"v2_device_tokens\",{token_hash:\"fixture-token-hash-\"+kind+\"-\"+s,device_id:device,kind,created_at:T,expires_at:LATER,rotated_at:null});\n    add(\"v2_alignments\",{id:alignment,ws_id:ws,requester_id:member,target_goal_id:goal,source_goal_id:source,state:\"approved\",revision:1,created_at:T,updated_at:LATER,decided_at:LATER,revoked_at:null,revoked_by:null});\n    add(\"v2_alignment_revisions\",{ws_id:ws,alignment_id:alignment,revision:1,choice:\"contribution\",effects_json:'{\"fixture\":\"effect\"}',approvers_json:JSON.stringify([owner]),note:\"Fixture note \u6771\u4eac\",author_id:member,created_at:T});\n    add(\"v2_alignment_approvals\",{ws_id:ws,alignment_id:alignment,revision:1,user_id:owner,at:LATER});\n    add(\"v2_sessions\",{ws_id:ws,session_key:session,user_id:member,device_id:device,harness:\"codex\",repo_key:\"fixture-repo-key-\"+s,repo_alias:\"Fixture repository\",title:\"Fixture session caf\u00e9\",started_at:T,state:\"shared\",stopped_at:null,governing_goal_id:goal,governing_alignment_id:alignment,agent_stopped:0,conflicts:1,created_at:T,updated_at:LATER,ended_reason:null});\n    add(\"v2_alignment_sessions\",{ws_id:ws,alignment_id:alignment,revision:1,session_key:session});\n    add(\"v2_epochs\",{ws_id:ws,session_key:session,epoch_id:epoch,goal_id:goal,goal_version_at_start:1,starts_at:T,ends_at:null,root_turn:\"fixture-root-turn\",cause:\"fixture-cause\",authority:\"alignment\",alignment_id:alignment,created_at:T});\n    add(\"v2_usage\",{ws_id:ws,session_key:session,request_key:\"fixture-request-key-\"+s,epoch_id:epoch,ts:T,model:\"fixture-model\",query_source:\"fixture-query\",input:123,output:45,cache_read:67,cache_write_5m:8,cache_write_1h:9,cache_write_unsplit:10,basis:\"fixture-basis\",est_list_usd_micros:1234567,price_table_version:\"fixture-prices\",source:\"fixture-source\",received_at:LATER});\n    add(\"v2_directives\",{seq:seq+1,id:directive,ws_id:ws,kind:\"goal_version\",goal_id:goal,goal_json:'{\"fixture\":\"goal\"}',binding_json:'{\"fixture\":\"binding\"}',created_at:T,request_json:null,hold_json:null});\n    if(version>=12) {\n      add(\"v2_directives\",{seq:seq+2,id:requestDirective,ws_id:ws,kind:\"request\",goal_id:goal,goal_json:null,binding_json:null,created_at:T,request_json:'{\"fixture\":\"request\"}',hold_json:null});\n      add(\"v2_directives\",{seq:seq+3,id:holdDirective,ws_id:ws,kind:\"hold\",goal_id:goal,goal_json:null,binding_json:null,created_at:T,request_json:null,hold_json:'{\"fixture\":\"hold\"}'});\n    }\n    add(\"v2_directive_targets\",{ws_id:ws,directive_id:directive,session_key:session});\n    add(\"v2_receipts\",{ws_id:ws,directive_id:directive,session_key:session,state:\"applied\",at:T,recorded_at:LATER,auto_accepted:0});\n    add(\"v2_activity\",{seq:seq+1,ws_id:ws,session_key:session,user_id:member,goal_id:goal,repo_id:\"fixture-repo-\"+s,kind:\"edit\",path_hash:\"fixture-path-hash-\"+s,path:\"fixture/file.ts\",text:null,at:T,expires_at:LATER});\n    add(\"v2_oauth_grants\",{id:grant,ws_id:ws,user_id:member,client_id:\"https://fixture.invalid/client/\"+s,client_name:\"Fixture app \"+s,redirect_host:\"fixture.invalid\",created_at:T,last_used_at:LATER,refresh_hash:\"fixture-refresh-hash-\"+s,prev_refresh_hash:\"fixture-prior-refresh-hash-\"+s,refresh_exp:1900000000,kid:\"fixture-key-\"+s,scope:\"goals:read changes:evidence\",last_read_at:LATER});\n    for(const state of [\"pending\",\"countered\",\"approved\",\"rejected\",\"withdrawn\",\"superseded\"]) {\n      const id=\"fixture-change-\"+state+\"-\"+s;\n      add(\"v2_change_requests\",{id,ws_id:ws,goal_id:state===\"countered\"?other:goal,requester_id:member,state,revision:1,base_version:1,changes_json:'{\"title\":\"Fixture changed caf\u00e9\"}',reason:\"Fixture reason \"+state,approved_by:state===\"approved\"?owner:null,rejected_by:state===\"rejected\"?owner:null,decision_note:\"Fixture decision\",version:state===\"approved\"?2:null,created_at:T,updated_at:LATER,decided_at:state===\"pending\"||state===\"countered\"?null:LATER,approved_without_evidence:state===\"approved\"?1:null,launch:state===\"approved\"?\"not_yet\":null,approved_json:state===\"approved\"?'{\"title\":\"Fixture approved\"}':null,launch_by:state===\"approved\"?owner:null,launch_at:state===\"approved\"?LATER:null});\n      add(\"v2_change_request_revisions\",{ws_id:ws,change_request_id:id,revision:1,base_version:1,changes_json:'{\"title\":\"Fixture changed caf\u00e9\"}',note:\"Fixture revision \u6771\u4eac\",author_id:member,created_at:T,snapshot_json:'{\"fixture\":\"snapshot\"}',condition:\"Fixture condition\",acknowledged_by:member,acknowledged_at:LATER});\n    }\n    add(\"v2_spend_rollups\",{ws_id:ws,goal_id:goal,day:\"2026-01-01\",model:\"fixture-model\",basis:\"fixture-basis\",requests:2,input:123,output:45,cache_read:67,cache_write_5m:8,cache_write_1h:9,cache_write_unsplit:10,est_list_usd_micros:1234567,unpriced_requests:1});\n    add(\"v2_former_members\",{ws_id:ws,user_id:viewer,n:null,removed_at:T,pseudonymised_at:null});\n    add(\"v2_former_members\",{ws_id:ws,user_id:null,n:17,removed_at:T,pseudonymised_at:LATER});\n    add(\"v2_passkey_use\",{passkey_id:\"fixture-passkey-\"+s,last_used_at:LATER});\n    add(\"v2_passkey_prompt_dismissed\",{user_id:owner,dismissed_at:T});\n    add(\"v2_creation_codes\",{id:\"fixture-code-\"+s,code_hash:\"fixture-code-hash-\"+s,email:\"owner-\"+s+\"@fixture.invalid\",request_id:\"fixture-access-\"+s,created_at:T,expires_at:LATER,revoked_at:null,redeemed_at:LATER,redeemed_by:owner,ws_id:ws});\n    add(\"v2_access_requests\",{id:\"fixture-access-\"+s,email:\"owner-\"+s+\"@fixture.invalid\",name:\"Fixture owner \"+s,company:\"Fixture company\",team_size:\"2-5\",use_case:\"Fixture use case\",interest:\"evaluate\",status:\"approved\",created_at:T,decided_at:LATER,code_id:\"fixture-code-\"+s});\n    add(\"v2_rate_hits\",{key:\"fixture-rate-\"+s,at:1767225600000});\n    add(\"v2_change_request_evidence\",{id:\"fixture-evidence-\"+s,ws_id:ws,change_request_id:approvedCR,revision:1,kind:\"doc\",url:\"https://fixture.invalid/doc/\"+s,label:\"Fixture evidence\",source:\"person\",added_by:owner,added_at:T});\n    add(\"v2_events\",{id:seq+1,name:\"workspace_created\",ws_id:ws,actor:\"fixture-actor-hash-\"+s,at:T,props:'{\"kind\":\"blank\"}'});\n    add(\"v2_asks\",{id:ask,ws_id:ws,team_id:pod,goal_id:goal,text:\"Fixture ask \u6771\u4eac\",from_label:\"Fixture meeting\",created_by:member,source_kind:\"meeting\",source_title:\"Fixture source\",source_date:\"2026-01-01\",state:\"accepted\",decided_by:owner,decided_at:LATER,created_at:T,updated_at:LATER});\n    add(\"v2_ask_mentions\",{ws_id:ws,ask_id:ask,n:1,date:\"2026-01-01\",text:\"Fixture mention\",source_title:\"Fixture source\",added_by:member,added_at:T});\n    add(\"v2_value_reports\",{id:\"fixture-value-report-\"+s,ws_id:ws,change_request_id:approvedCR,person_id:member,estimate:\"about_a_week\",note:\"Fixture value note\",created_at:T,updated_at:LATER});\n    add(\"v2_requests\",{id:request,ws_id:ws,goal_id:goal,type:\"checkpoint\",target_goal_id:null,goal_version:1,note:\"Fixture request\",sender_id:owner,sender_role:\"owner\",directive_id:requestDirective,created_at:T,cancelled_at:null,cancelled_by:null});\n    add(\"v2_request_targets\",{ws_id:ws,request_id:request,session_key:session,state:\"accepted\",auto_accepted:1,updated_at:LATER,ended_reason:null});\n    add(\"v2_goal_holds\",{ws_id:ws,goal_id:goal,held_by:owner,reason:\"Fixture hold\",held_at:T,directive_id:holdDirective});\n    add(\"v2_steering_events\",{ws_id:ws,session_key:session,goal_id:goal,suggested_goal_id:other,share:20,target:40,at:T,recorded_at:LATER});\n    add(\"v2_reallocations\",{id:reallocation,ws_id:ws,requester_id:member,state:\"approved\",revision:1,launch:\"pending\",launch_by:owner,launch_at:LATER,decided_by:owner,decision_note:\"Fixture decision\",created_at:T,updated_at:LATER,decided_at:LATER});\n    add(\"v2_reallocation_revisions\",{ws_id:ws,reallocation_id:reallocation,revision:1,targets_json:JSON.stringify([{goal_id:goal,target_share:40},{goal_id:other,target_share:60}]),note:\"Fixture revision\",author_id:member,created_at:T});\n    add(\"v2_reallocation_approvals\",{ws_id:ws,reallocation_id:reallocation,revision:1,goal_id:goal,user_id:owner,at:LATER});\n    add(\"v2_deleted_sessions\",{ws_id:ws,key_hash:\"fixture-deleted-key-hash-\"+s,deleted_at:T});\n    add(\"v2_oauth_goal_sends\",{grant_id:grant,ws_id:ws,goal_id:goal,version:1,sent_at:LATER});\n  }\n  for(const [name,table] of tables) {\n    assert((added.get(name)||0)>0,\"Every table present must contain fixture data: \"+name);\n    if(table.non_reusing_sequence) {\n      const first=db.prepare(`SELECT * FROM ${identifier(name)} LIMIT 1`).get();\n      const primary=table.columns.find(c=>c.pk===1&&c.type===\"INTEGER\").name;\n      const clone={...first,[primary]:9000000};\n      if(name===\"v2_directives\")clone.id=\"fixture-deleted-high-directive\";\n      if(name===\"v2_events\"){clone.name=\"value_card_viewed\";clone.actor=\"fixture-deleted-high-actor\";}\n      add(name,clone);db.prepare(`DELETE FROM ${identifier(name)} WHERE ${identifier(primary)}=?`).run(9000000);\n    }\n  }\n  assert.equal(db.prepare(\"PRAGMA foreign_key_check\").all().length,0,\"Populated fixture must be valid before migration\");\n  return tables;\n}\n\nreturn {seed,rows,stable,identifier,T,LATER};\n};\n";
"use strict";
// Independent acceptance only. No retained implementation is a candidate input.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {DatabaseSync}=require("node:sqlite"),{stripTypeScriptTypes}=require("node:module");
const {createHash}=require("node:crypto"),{pathToFileURL}=require("node:url");
const CAPABILITY="storage-schema.change-programs",SYMBOL="change_programs",MODULE="storage_schema/change_programs";
const SOURCE_SHA="48cf01fc8be6bf4e000439f577362fae4bbd13c981ef8258961d51706ce32309";
const hash=x=>createHash("sha256").update(x).digest("hex");
function embedded(source){const m={exports:{}};new Function("require","module","exports",source)(require,m,m.exports);return m.exports;}
const Model=embedded(MODELER_SOURCE),fixtures=embedded(SEED_SOURCE),{stable,q}=Model;
const DECLARED_CHECK_ORDER={"v2_goals|[\"{\\\"arg\\\":{\\\"field\\\":\\\"status\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"active\\\"},{\\\"literal\\\":\\\"achieved\\\"},{\\\"literal\\\":\\\"dropped\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"visibility\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"private\\\"},{\\\"literal\\\":\\\"pod\\\"},{\\\"literal\\\":\\\"workspace\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"visibility\\\"},{\\\"literal\\\":\\\"pod\\\"}],\\\"op\\\":\\\"not_equal\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"pod_id\\\"},\\\"op\\\":\\\"is_not_null\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"visibility\"},\"choices\":[{\"literal\":\"private\"},{\"literal\":\"pod\"},{\"literal\":\"workspace\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"status\"},\"choices\":[{\"literal\":\"active\"},{\"literal\":\"achieved\"},{\"literal\":\"dropped\"}],\"op\":\"in\"}","{\"args\":[{\"args\":[{\"field\":\"visibility\"},{\"literal\":\"pod\"}],\"op\":\"not_equal\"},{\"arg\":{\"field\":\"pod_id\"},\"op\":\"is_not_null\"}],\"op\":\"or\"}"],"v2_sessions|[\"{\\\"arg\\\":{\\\"field\\\":\\\"harness\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"claude-code\\\"},{\\\"literal\\\":\\\"codex\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"shared\\\"},{\\\"literal\\\":\\\"suspended\\\"},{\\\"literal\\\":\\\"stopped\\\"}],\\\"op\\\":\\\"in\\\"}\"]":["{\"arg\":{\"field\":\"harness\"},\"choices\":[{\"literal\":\"claude-code\"},{\"literal\":\"codex\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"shared\"},{\"literal\":\"suspended\"},{\"literal\":\"stopped\"}],\"op\":\"in\"}"],"v2_goals|[\"{\\\"arg\\\":{\\\"field\\\":\\\"level\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"company\\\"},{\\\"literal\\\":\\\"team\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"status\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"active\\\"},{\\\"literal\\\":\\\"achieved\\\"},{\\\"literal\\\":\\\"dropped\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"visibility\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"private\\\"},{\\\"literal\\\":\\\"pod\\\"},{\\\"literal\\\":\\\"workspace\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"level\\\"},{\\\"literal\\\":\\\"company\\\"}],\\\"op\\\":\\\"not_equal\\\"},{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"pod_id\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"args\\\":[{\\\"field\\\":\\\"visibility\\\"},{\\\"literal\\\":\\\"workspace\\\"}],\\\"op\\\":\\\"equal\\\"}],\\\"op\\\":\\\"and\\\"}],\\\"op\\\":\\\"or\\\"}\",\"{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"visibility\\\"},{\\\"literal\\\":\\\"pod\\\"}],\\\"op\\\":\\\"not_equal\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"pod_id\\\"},\\\"op\\\":\\\"is_not_null\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"visibility\"},\"choices\":[{\"literal\":\"private\"},{\"literal\":\"pod\"},{\"literal\":\"workspace\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"status\"},\"choices\":[{\"literal\":\"active\"},{\"literal\":\"achieved\"},{\"literal\":\"dropped\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"level\"},\"choices\":[{\"literal\":\"company\"},{\"literal\":\"team\"}],\"op\":\"in\"}","{\"args\":[{\"args\":[{\"field\":\"visibility\"},{\"literal\":\"pod\"}],\"op\":\"not_equal\"},{\"arg\":{\"field\":\"pod_id\"},\"op\":\"is_not_null\"}],\"op\":\"or\"}","{\"args\":[{\"args\":[{\"field\":\"level\"},{\"literal\":\"company\"}],\"op\":\"not_equal\"},{\"args\":[{\"arg\":{\"field\":\"pod_id\"},\"op\":\"is_null\"},{\"args\":[{\"field\":\"visibility\"},{\"literal\":\"workspace\"}],\"op\":\"equal\"}],\"op\":\"and\"}],\"op\":\"or\"}"],"v2_invites|[\"{\\\"arg\\\":{\\\"field\\\":\\\"role\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"owner\\\"},{\\\"literal\\\":\\\"member\\\"},{\\\"literal\\\":\\\"viewer\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"team_role\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"lead\\\"},{\\\"literal\\\":\\\"member\\\"}],\\\"op\\\":\\\"in\\\"}\"]":["{\"arg\":{\"field\":\"role\"},\"choices\":[{\"literal\":\"owner\"},{\"literal\":\"member\"},{\"literal\":\"viewer\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"team_role\"},\"choices\":[{\"literal\":\"lead\"},{\"literal\":\"member\"}],\"op\":\"in\"}"],"v2_access_requests|[\"{\\\"arg\\\":{\\\"field\\\":\\\"interest\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"try\\\"},{\\\"literal\\\":\\\"evaluate\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"status\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"pending\\\"},{\\\"literal\\\":\\\"approved\\\"},{\\\"literal\\\":\\\"declined\\\"}],\\\"op\\\":\\\"in\\\"}\"]":["{\"arg\":{\"field\":\"interest\"},\"choices\":[{\"literal\":\"try\"},{\"literal\":\"evaluate\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"status\"},\"choices\":[{\"literal\":\"pending\"},{\"literal\":\"approved\"},{\"literal\":\"declined\"}],\"op\":\"in\"}"],"v2_change_request_evidence|[\"{\\\"arg\\\":{\\\"field\\\":\\\"kind\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"pr\\\"},{\\\"literal\\\":\\\"ci_run\\\"},{\\\"literal\\\":\\\"incident\\\"},{\\\"literal\\\":\\\"dashboard\\\"},{\\\"literal\\\":\\\"doc\\\"},{\\\"literal\\\":\\\"other\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"source\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"person\\\"},{\\\"literal\\\":\\\"agent\\\"}],\\\"op\\\":\\\"in\\\"}\"]":["{\"arg\":{\"field\":\"kind\"},\"choices\":[{\"literal\":\"pr\"},{\"literal\":\"ci_run\"},{\"literal\":\"incident\"},{\"literal\":\"dashboard\"},{\"literal\":\"doc\"},{\"literal\":\"other\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"source\"},\"choices\":[{\"literal\":\"person\"},{\"literal\":\"agent\"}],\"op\":\"in\"}"],"v2_asks|[\"{\\\"arg\\\":{\\\"field\\\":\\\"source_kind\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"meeting\\\"},{\\\"literal\\\":\\\"manual\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"open\\\"},{\\\"literal\\\":\\\"accepted\\\"},{\\\"literal\\\":\\\"done\\\"},{\\\"literal\\\":\\\"declined\\\"},{\\\"literal\\\":\\\"withdrawn\\\"}],\\\"op\\\":\\\"in\\\"}\"]":["{\"arg\":{\"field\":\"source_kind\"},\"choices\":[{\"literal\":\"meeting\"},{\"literal\":\"manual\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"open\"},{\"literal\":\"accepted\"},{\"literal\":\"done\"},{\"literal\":\"declined\"},{\"literal\":\"withdrawn\"}],\"op\":\"in\"}"],"v2_value_reports|[\"{\\\"arg\\\":{\\\"field\\\":\\\"estimate\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"same_day\\\"},{\\\"literal\\\":\\\"two_to_three_days\\\"},{\\\"literal\\\":\\\"about_a_week\\\"},{\\\"literal\\\":\\\"longer\\\"},{\\\"literal\\\":\\\"would_not_be_decided\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"note\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"note\\\"}],\\\"function\\\":\\\"length\\\"},{\\\"literal\\\":500}],\\\"op\\\":\\\"at_most\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"estimate\"},\"choices\":[{\"literal\":\"same_day\"},{\"literal\":\"two_to_three_days\"},{\"literal\":\"about_a_week\"},{\"literal\":\"longer\"},{\"literal\":\"would_not_be_decided\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"note\"},\"op\":\"is_null\"},{\"args\":[{\"args\":[{\"field\":\"note\"}],\"function\":\"length\"},{\"literal\":500}],\"op\":\"at_most\"}],\"op\":\"or\"}"],"v2_receipts|[\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"received\\\"},{\\\"literal\\\":\\\"applied\\\"},{\\\"literal\\\":\\\"enforced\\\"},{\\\"literal\\\":\\\"accepted\\\"},{\\\"literal\\\":\\\"declined\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"auto_accepted\\\"},\\\"choices\\\":[{\\\"literal\\\":0},{\\\"literal\\\":1}],\\\"op\\\":\\\"in\\\"},{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"auto_accepted\\\"},{\\\"literal\\\":0}],\\\"op\\\":\\\"equal\\\"},{\\\"args\\\":[{\\\"field\\\":\\\"state\\\"},{\\\"literal\\\":\\\"accepted\\\"}],\\\"op\\\":\\\"equal\\\"}],\\\"op\\\":\\\"or\\\"}],\\\"op\\\":\\\"and\\\"}\"]":["{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"received\"},{\"literal\":\"applied\"},{\"literal\":\"enforced\"},{\"literal\":\"accepted\"},{\"literal\":\"declined\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"auto_accepted\"},\"choices\":[{\"literal\":0},{\"literal\":1}],\"op\":\"in\"},{\"args\":[{\"args\":[{\"field\":\"auto_accepted\"},{\"literal\":0}],\"op\":\"equal\"},{\"args\":[{\"field\":\"state\"},{\"literal\":\"accepted\"}],\"op\":\"equal\"}],\"op\":\"or\"}],\"op\":\"and\"}"],"v2_request_targets|[\"{\\\"arg\\\":{\\\"field\\\":\\\"auto_accepted\\\"},\\\"choices\\\":[{\\\"literal\\\":0},{\\\"literal\\\":1}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"sent\\\"},{\\\"literal\\\":\\\"received\\\"},{\\\"literal\\\":\\\"accepted\\\"},{\\\"literal\\\":\\\"declined\\\"},{\\\"literal\\\":\\\"expired\\\"}],\\\"op\\\":\\\"in\\\"}\"]":["{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"sent\"},{\"literal\":\"received\"},{\"literal\":\"accepted\"},{\"literal\":\"declined\"},{\"literal\":\"expired\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"auto_accepted\"},\"choices\":[{\"literal\":0},{\"literal\":1}],\"op\":\"in\"}"],"v2_requests|[\"{\\\"arg\\\":{\\\"field\\\":\\\"sender_role\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"approver\\\"},{\\\"literal\\\":\\\"owner\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"type\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"replan\\\"},{\\\"literal\\\":\\\"checkpoint\\\"},{\\\"literal\\\":\\\"switch_goal\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"note\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"note\\\"}],\\\"function\\\":\\\"length\\\"},{\\\"literal\\\":280}],\\\"op\\\":\\\"at_most\\\"}],\\\"op\\\":\\\"or\\\"}\",\"{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"type\\\"},{\\\"literal\\\":\\\"switch_goal\\\"}],\\\"op\\\":\\\"equal\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"target_goal_id\\\"},\\\"op\\\":\\\"is_not_null\\\"}],\\\"op\\\":\\\"equal\\\"}\"]":["{\"arg\":{\"field\":\"type\"},\"choices\":[{\"literal\":\"replan\"},{\"literal\":\"checkpoint\"},{\"literal\":\"switch_goal\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"note\"},\"op\":\"is_null\"},{\"args\":[{\"args\":[{\"field\":\"note\"}],\"function\":\"length\"},{\"literal\":280}],\"op\":\"at_most\"}],\"op\":\"or\"}","{\"arg\":{\"field\":\"sender_role\"},\"choices\":[{\"literal\":\"approver\"},{\"literal\":\"owner\"}],\"op\":\"in\"}","{\"args\":[{\"args\":[{\"field\":\"type\"},{\"literal\":\"switch_goal\"}],\"op\":\"equal\"},{\"arg\":{\"field\":\"target_goal_id\"},\"op\":\"is_not_null\"}],\"op\":\"equal\"}"],"v2_change_requests|[\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"pending\\\"},{\\\"literal\\\":\\\"countered\\\"},{\\\"literal\\\":\\\"approved\\\"},{\\\"literal\\\":\\\"rejected\\\"},{\\\"literal\\\":\\\"withdrawn\\\"},{\\\"literal\\\":\\\"superseded\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"launch\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"launch\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"pending\\\"},{\\\"literal\\\":\\\"not_yet\\\"},{\\\"literal\\\":\\\"launched\\\"},{\\\"literal\\\":\\\"superseded\\\"}],\\\"op\\\":\\\"in\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"pending\"},{\"literal\":\"countered\"},{\"literal\":\"approved\"},{\"literal\":\"rejected\"},{\"literal\":\"withdrawn\"},{\"literal\":\"superseded\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"launch\"},\"op\":\"is_null\"},{\"arg\":{\"field\":\"launch\"},\"choices\":[{\"literal\":\"pending\"},{\"literal\":\"not_yet\"},{\"literal\":\"launched\"},{\"literal\":\"superseded\"}],\"op\":\"in\"}],\"op\":\"or\"}"],"v2_goals|[\"{\\\"arg\\\":{\\\"field\\\":\\\"level\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"company\\\"},{\\\"literal\\\":\\\"team\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"status\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"active\\\"},{\\\"literal\\\":\\\"achieved\\\"},{\\\"literal\\\":\\\"dropped\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"visibility\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"private\\\"},{\\\"literal\\\":\\\"pod\\\"},{\\\"literal\\\":\\\"workspace\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"target_share\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"target_share\\\"},\\\"high\\\":{\\\"literal\\\":100},\\\"low\\\":{\\\"literal\\\":0},\\\"op\\\":\\\"between\\\"}],\\\"op\\\":\\\"or\\\"}\",\"{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"level\\\"},{\\\"literal\\\":\\\"company\\\"}],\\\"op\\\":\\\"not_equal\\\"},{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"pod_id\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"args\\\":[{\\\"field\\\":\\\"visibility\\\"},{\\\"literal\\\":\\\"workspace\\\"}],\\\"op\\\":\\\"equal\\\"}],\\\"op\\\":\\\"and\\\"}],\\\"op\\\":\\\"or\\\"}\",\"{\\\"args\\\":[{\\\"args\\\":[{\\\"field\\\":\\\"visibility\\\"},{\\\"literal\\\":\\\"pod\\\"}],\\\"op\\\":\\\"not_equal\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"pod_id\\\"},\\\"op\\\":\\\"is_not_null\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"visibility\"},\"choices\":[{\"literal\":\"private\"},{\"literal\":\"pod\"},{\"literal\":\"workspace\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"status\"},\"choices\":[{\"literal\":\"active\"},{\"literal\":\"achieved\"},{\"literal\":\"dropped\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"level\"},\"choices\":[{\"literal\":\"company\"},{\"literal\":\"team\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"target_share\"},\"op\":\"is_null\"},{\"arg\":{\"field\":\"target_share\"},\"high\":{\"literal\":100},\"low\":{\"literal\":0},\"op\":\"between\"}],\"op\":\"or\"}","{\"args\":[{\"args\":[{\"field\":\"visibility\"},{\"literal\":\"pod\"}],\"op\":\"not_equal\"},{\"arg\":{\"field\":\"pod_id\"},\"op\":\"is_not_null\"}],\"op\":\"or\"}","{\"args\":[{\"args\":[{\"field\":\"level\"},{\"literal\":\"company\"}],\"op\":\"not_equal\"},{\"args\":[{\"arg\":{\"field\":\"pod_id\"},\"op\":\"is_null\"},{\"args\":[{\"field\":\"visibility\"},{\"literal\":\"workspace\"}],\"op\":\"equal\"}],\"op\":\"and\"}],\"op\":\"or\"}"],"v2_reallocations|[\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"pending\\\"},{\\\"literal\\\":\\\"countered\\\"},{\\\"literal\\\":\\\"approved\\\"},{\\\"literal\\\":\\\"rejected\\\"},{\\\"literal\\\":\\\"withdrawn\\\"},{\\\"literal\\\":\\\"superseded\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"launch\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"launch\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"pending\\\"},{\\\"literal\\\":\\\"not_yet\\\"},{\\\"literal\\\":\\\"launched\\\"},{\\\"literal\\\":\\\"superseded\\\"}],\\\"op\\\":\\\"in\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"pending\"},{\"literal\":\"countered\"},{\"literal\":\"approved\"},{\"literal\":\"rejected\"},{\"literal\":\"withdrawn\"},{\"literal\":\"superseded\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"launch\"},\"op\":\"is_null\"},{\"arg\":{\"field\":\"launch\"},\"choices\":[{\"literal\":\"pending\"},{\"literal\":\"not_yet\"},{\"literal\":\"launched\"},{\"literal\":\"superseded\"}],\"op\":\"in\"}],\"op\":\"or\"}"],"v2_steering_events|[\"{\\\"arg\\\":{\\\"field\\\":\\\"share\\\"},\\\"high\\\":{\\\"literal\\\":100},\\\"low\\\":{\\\"literal\\\":0},\\\"op\\\":\\\"between\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"target\\\"},\\\"high\\\":{\\\"literal\\\":100},\\\"low\\\":{\\\"literal\\\":0},\\\"op\\\":\\\"between\\\"}\"]":["{\"arg\":{\"field\":\"share\"},\"high\":{\"literal\":100},\"low\":{\"literal\":0},\"op\":\"between\"}","{\"arg\":{\"field\":\"target\"},\"high\":{\"literal\":100},\"low\":{\"literal\":0},\"op\":\"between\"}"],"v2_sessions|[\"{\\\"arg\\\":{\\\"field\\\":\\\"harness\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"claude-code\\\"},{\\\"literal\\\":\\\"codex\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"shared\\\"},{\\\"literal\\\":\\\"suspended\\\"},{\\\"literal\\\":\\\"stopped\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"ended_reason\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"args\\\":[{\\\"field\\\":\\\"ended_reason\\\"},{\\\"literal\\\":\\\"device_signed_out\\\"}],\\\"op\\\":\\\"equal\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"harness\"},\"choices\":[{\"literal\":\"claude-code\"},{\"literal\":\"codex\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"shared\"},{\"literal\":\"suspended\"},{\"literal\":\"stopped\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"ended_reason\"},\"op\":\"is_null\"},{\"args\":[{\"field\":\"ended_reason\"},{\"literal\":\"device_signed_out\"}],\"op\":\"equal\"}],\"op\":\"or\"}"],"v2_sessions|[\"{\\\"arg\\\":{\\\"field\\\":\\\"harness\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"claude-code\\\"},{\\\"literal\\\":\\\"codex\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"shared\\\"},{\\\"literal\\\":\\\"suspended\\\"},{\\\"literal\\\":\\\"stopped\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"ended_reason\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"ended_reason\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"device_signed_out\\\"},{\\\"literal\\\":\\\"member_removed\\\"}],\\\"op\\\":\\\"in\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"harness\"},\"choices\":[{\"literal\":\"claude-code\"},{\"literal\":\"codex\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"shared\"},{\"literal\":\"suspended\"},{\"literal\":\"stopped\"}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"ended_reason\"},\"op\":\"is_null\"},{\"arg\":{\"field\":\"ended_reason\"},\"choices\":[{\"literal\":\"device_signed_out\"},{\"literal\":\"member_removed\"}],\"op\":\"in\"}],\"op\":\"or\"}"],"v2_request_targets|[\"{\\\"arg\\\":{\\\"field\\\":\\\"auto_accepted\\\"},\\\"choices\\\":[{\\\"literal\\\":0},{\\\"literal\\\":1}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"arg\\\":{\\\"field\\\":\\\"state\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"sent\\\"},{\\\"literal\\\":\\\"received\\\"},{\\\"literal\\\":\\\"accepted\\\"},{\\\"literal\\\":\\\"declined\\\"},{\\\"literal\\\":\\\"expired\\\"}],\\\"op\\\":\\\"in\\\"}\",\"{\\\"args\\\":[{\\\"arg\\\":{\\\"field\\\":\\\"ended_reason\\\"},\\\"op\\\":\\\"is_null\\\"},{\\\"arg\\\":{\\\"field\\\":\\\"ended_reason\\\"},\\\"choices\\\":[{\\\"literal\\\":\\\"device_signed_out\\\"},{\\\"literal\\\":\\\"member_removed\\\"}],\\\"op\\\":\\\"in\\\"}],\\\"op\\\":\\\"or\\\"}\"]":["{\"arg\":{\"field\":\"state\"},\"choices\":[{\"literal\":\"sent\"},{\"literal\":\"received\"},{\"literal\":\"accepted\"},{\"literal\":\"declined\"},{\"literal\":\"expired\"}],\"op\":\"in\"}","{\"arg\":{\"field\":\"auto_accepted\"},\"choices\":[{\"literal\":0},{\"literal\":1}],\"op\":\"in\"}","{\"args\":[{\"arg\":{\"field\":\"ended_reason\"},\"op\":\"is_null\"},{\"arg\":{\"field\":\"ended_reason\"},\"choices\":[{\"literal\":\"device_signed_out\"},{\"literal\":\"member_removed\"}],\"op\":\"in\"}],\"op\":\"or\"}"]};
// Normalize only permutations of known, total CHECK clauses from the reviewed target.
function predicateIsTotal(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys=Object.keys(value);
  if (keys.length===1 && Object.hasOwn(value,'literal')) return value.literal===null || ['string','boolean'].includes(typeof value.literal) || (typeof value.literal==='number' && Number.isFinite(value.literal));
  if (keys.length===1 && typeof value.field==='string') return true;
  if (keys.length===2 && typeof value.function==='string') return ['length','json_valid'].includes(value.function) && Array.isArray(value.args) && value.args.length===1 && value.args.every(predicateIsTotal);
  if (typeof value.op!=='string') return false;
  if (['and','or','equal','not_equal','at_most','at_least','less_than','greater_than'].includes(value.op)) return keys.length===2 && Array.isArray(value.args) && value.args.length===2 && value.args.every(predicateIsTotal);
  if (['is_null','is_not_null'].includes(value.op)) return keys.length===2 && predicateIsTotal(value.arg);
  if (value.op==='in') return keys.length===3 && predicateIsTotal(value.arg) && Array.isArray(value.choices) && value.choices.length>0 && value.choices.every(predicateIsTotal);
  if (value.op==='between') return keys.length===4 && [value.arg,value.low,value.high].every(predicateIsTotal);
  return false;
}
function normalizeModel(model) {
  if (model.checks.length<2 || !model.checks.every(predicateIsTotal)) return model;
  const keys=model.checks.map(stable);
  const order=DECLARED_CHECK_ORDER[model.name+'|'+stable(keys.slice().sort())];
  if (!order || keys.every((key,index)=>key===order[index])) return model;
  const groups=new Map();
  for (let index=0;index<keys.length;index++) {
    if (!groups.has(keys[index])) groups.set(keys[index],[]);
    groups.get(keys[index]).push(model.checks[index]);
  }
  return {...model,checks:order.map(key=>groups.get(key).shift())};
}

function programCollection(get){const a=get(),b=get();assert(Array.isArray(a)&&Object.getPrototypeOf(a)===Array.prototype);assert.equal(a.length,23);assert(a.every(s=>typeof s==="string"&&s.trim()));assert.notEqual(a,b);assert.deepEqual(a,b);a[0]="owned observer mutation";a.pop();assert.deepEqual(get(),b);return b;}
function permitted(sql){for(const [kind,value] of Model.tokens(sql))if(kind==="word")assert(!["ATTACH","DETACH","VACUUM","PRAGMA","LOAD_EXTENSION","READFILE","WRITEFILE"].includes(value.toUpperCase()),"Out-of-scope SQL operation");}
function open(){const db=new DatabaseSync(":memory:",{enableForeignKeyConstraints:true});db.exec("CREATE TABLE ba_user (id TEXT PRIMARY KEY); CREATE TABLE ba_passkey (id TEXT PRIMARY KEY);");return db;}
function apply(db,programs,from,to){
  db.exec("PRAGMA foreign_keys=OFF");
  try{for(let version=from+1;version<=to;version++){
    permitted(programs[version-1]);db.exec("BEGIN IMMEDIATE");
    try{db.exec(programs[version-1]);assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);db.exec("PRAGMA user_version="+version);db.exec("COMMIT");}
    catch(error){try{db.exec("ROLLBACK");}catch{}throw error;}
  }}finally{db.exec("PRAGMA foreign_keys=ON");}
}
function seeded(db,version){const tables=Model.observe(db).map(t=>({...t,non_reusing_sequence:Model.tableModel(t).non_reusing_sequence})),snapshots=[];snapshots[version]={tables};const factory=fixtures({snapshots});factory.seed(db,version);return {tables:new Map(tables.map(t=>[t.name,t])),...factory};}
function state(db,withData=false){
  const raw=Model.observe(db),models=raw.map(Model.tableModel).map(normalizeModel);
  const external=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE tbl_name NOT LIKE 'v2_%' ORDER BY type,name").all();
  const sequences=db.prepare("SELECT name FROM sqlite_schema WHERE name='sqlite_sequence'").get()?db.prepare("SELECT name,seq FROM sqlite_sequence ORDER BY name").all():[];
  const pragmas={foreign_keys:db.prepare("PRAGMA foreign_keys").get().foreign_keys,busy_timeout:db.prepare("PRAGMA busy_timeout").get().timeout,synchronous:db.prepare("PRAGMA synchronous").get().synchronous,journal_mode:db.prepare("PRAGMA journal_mode").get().journal_mode,databases:db.prepare("PRAGMA database_list").all().map(d=>({name:d.name,file:d.file}))};
  const result={version:db.prepare("PRAGMA user_version").get().user_version,models,external,sequences,pragmas};
  if(withData)result.data=raw.map(t=>{const records=db.prepare("SELECT * FROM "+q(t.name)).all().map(stable).sort();return {table:t.name,rows:records.length,sha256:hash(JSON.stringify(records))};});
  return result;
}
function errors(e){return {name:e.name??typeof e,code:e.code??null,errcode:e.errcode??null,...(e.errcode===1811?{message:e.message}:{})};}
function shape(programs,version){const db=open();try{apply(db,programs,0,version);return state(db);}finally{db.close();}}
function populated(programs,version){const db=open();try{apply(db,programs,0,version);seeded(db,version);apply(db,programs,version,23);return state(db,true);}finally{db.close();}}
function physical(programs){const db=open(),cases=[];const {T}=fixtures({});
function trial(name, fn) {
  db.exec("SAVEPOINT compatibility_trial");
  try {cases.push({name, value:fn() ?? null, passed:true});}
  finally {db.exec("ROLLBACK TO compatibility_trial; RELEASE compatibility_trial");}
}
function rejected(fn, errcode) {
  let error;
  try {fn();} catch (e) {error=e;}
  assert(error, "Expected a constraint error");
  assert.equal(error.errcode, errcode);
  return error.errcode;
}
function clone(table, change, omit=[]) {
  const value = {...db.prepare(`SELECT * FROM ${q(table)} LIMIT 1`).get(), ...change};
  const keys = Object.keys(value).filter(key => !omit.includes(key));
  return db.prepare(`INSERT INTO ${q(table)} (${keys.map(q).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`).run(...keys.map(key=>value[key]));
}
try{apply(db,programs,0,23);seeded(db,23);
  trial("nullable-text-primary-key-is-not-strengthened",()=>{
    clone("v2_workspaces",{id:null});clone("v2_workspaces",{id:null});
    const n=db.prepare("SELECT count(*) AS n FROM v2_workspaces WHERE id IS NULL").get().n;assert.equal(n,2);return n;
  });
  trial("explicit-non-null-primary-key-field",()=>rejected(()=>clone("v2_members",{user_id:null}),1299));
  trial("integer-affinity-is-not-strict-typing",()=>{
    for(const value of ["13",1.25,"opaque"])db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-affinity',?)").run(value);
    const rows=db.prepare("SELECT at,typeof(at) AS type FROM v2_rate_hits WHERE key='fixture-affinity' ORDER BY rowid").all();
    assert.deepEqual(rows.map(row=>[row.at,row.type]),[[13,"integer"],[1.25,"real"],["opaque","text"]]);return rows.map(row=>row.type);
  });
  trial("repeated-rate-hits-remain-separate",()=>{
    const insert=db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-duplicate',13)");insert.run();insert.run();
    const n=db.prepare("SELECT count(*) AS n FROM v2_rate_hits WHERE key='fixture-duplicate'").get().n;assert.equal(n,2);return n;
  });
  trial("nullable-enum-check-retains-null",()=>{
    db.prepare("UPDATE v2_invites SET team_role=NULL WHERE id='fixture-invite-a'").run();
    assert.equal(db.prepare("SELECT team_role FROM v2_invites WHERE id='fixture-invite-a'").get().team_role,null);return true;
  });
  trial("optional-composite-reference-retains-null",()=>{
    db.prepare("UPDATE v2_goals SET pod_id=NULL,visibility='workspace' WHERE id='fixture-goal-a'").run();
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return true;
  });
  trial("historical-actors-do-not-require-current-membership",()=>{
    for(const [table,column] of [["v2_goals","owner_id"],["v2_alignments","requester_id"],["v2_sessions","user_id"]]) {
      const result=db.prepare(`UPDATE ${q(table)} SET ${q(column)}='fixture-departed-label' WHERE ws_id='fixture-ws-a'`).run();assert(result.changes>0);
    }
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return 3;
  });
  trial("historical-labels-are-not-new-foreign-keys",()=>{
    db.prepare("UPDATE v2_creation_codes SET request_id='fixture-gone-request',ws_id='fixture-gone-workspace' WHERE id='fixture-code-a'").run();
    db.prepare("UPDATE v2_goal_holds SET directive_id='fixture-gone-directive' WHERE goal_id='fixture-goal-a'").run();
    db.prepare("UPDATE v2_audit SET actor_id='fixture-gone-person',object_id='fixture-gone-object',ws_id='fixture-gone-workspace' WHERE seq=11").run();
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return true;
  });
  trial("reallocation-approval-retains-declared-reference-scope",()=>{
    clone("v2_reallocation_approvals",{revision:999,goal_id:"fixture-gone-goal",user_id:"fixture-gone-person"});
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return true;
  });
  trial("unicode-length-uses-code-points",()=>{
    const update=db.prepare("UPDATE v2_value_reports SET note=? WHERE id='fixture-value-report-a'");
    update.run("\u{1f642}".repeat(500));
    assert.equal(db.prepare("SELECT length(note) AS n FROM v2_value_reports WHERE id='fixture-value-report-a'").get().n,500);
    return rejected(()=>update.run("\u{1f642}".repeat(501)),275);
  });
  trial("null-workspace-exempts-workspace-once-index",()=>{
    clone("v2_events",{name:"workspace_created",ws_id:null},["id"]);clone("v2_events",{name:"workspace_created",ws_id:null},["id"]);
    const n=db.prepare("SELECT count(*) AS n FROM v2_events WHERE name='workspace_created' AND ws_id IS NULL").get().n;assert.equal(n,2);return n;
  });
  trial("null-actor-exempts-person-once-index",()=>{
    clone("v2_events",{name:"value_card_viewed",actor:null},["id"]);clone("v2_events",{name:"value_card_viewed",actor:null},["id"]);
    const n=db.prepare("SELECT count(*) AS n FROM v2_events WHERE name='value_card_viewed' AND actor IS NULL").get().n;assert.equal(n,2);return n;
  });
  trial("event-no-op-update-still-aborts",()=>rejected(()=>db.prepare("UPDATE v2_events SET name=name WHERE id=11").run(),1811));
  trial("constraint-failure-aborts-statement-not-outer-transaction",()=>{
    db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-outer',1)").run();
    rejected(()=>db.prepare("INSERT INTO v2_members(ws_id,user_id,role,created_at) VALUES('fixture-ws-a','fixture-absent-account','member',?)").run(T),787);
    db.prepare("INSERT INTO v2_rate_hits(key,at) VALUES('fixture-outer',2)").run();
    const n=db.prepare("SELECT count(*) AS n FROM v2_rate_hits WHERE key='fixture-outer'").get().n;assert.equal(n,2);return n;
  });
  trial("binary-unique-key-collation",()=>{
    clone("v2_creation_codes",{id:"fixture-case-code-1",code_hash:"fixture-CaSe"});
    clone("v2_creation_codes",{id:"fixture-case-code-2",code_hash:"fixture-case"});
    const n=db.prepare("SELECT count(*) AS n FROM v2_creation_codes WHERE code_hash='fixture-case'").get().n;assert.equal(n,1);return n;
  });
  for(const table of ["v2_audit","v2_activity","v2_directives"])trial("deleted-high-sequence/"+table,()=>{
    const previous=db.prepare("SELECT seq FROM sqlite_sequence WHERE name=?").get(table).seq;assert.equal(previous,9000000);
    const change=table==="v2_directives"?{id:"fixture-next-directive"}:{};clone(table,change,["seq"]);
    const next=db.prepare(`SELECT max(seq) AS n FROM ${q(table)}`).get().n;assert.equal(next,9000001);return next;
  });
  trial("event-rowid-has-no-nonreuse-promise",()=>{
    clone("v2_events",{id:9000000,name:"fixture-temporary-event"});db.prepare("DELETE FROM v2_events WHERE id=9000000").run();
    clone("v2_events",{name:"fixture-next-event"},["id"]);
    const id=db.prepare("SELECT id FROM v2_events WHERE name='fixture-next-event'").get().id;assert(id<9000000);return id;
  });
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);return cases;
}finally{db.close();}}
function constraintCases(programs){const db=open(),cases=[];try{apply(db,programs,0,23);const {tables,rows,identifier,T}=seeded(db,23);const api={run(sql,...args){return db.prepare(sql).run(...args).changes;},get(sql,...args){return db.prepare(sql).get(...args);},all(sql,...args){return db.prepare(sql).all(...args);}};const normalized=errors;
  for(const suffix of ["a","b"]) {
    const old=db.prepare("SELECT * FROM v2_requests WHERE id=?").get("fixture-request-"+suffix);
    const row={...old,id:"fixture-switch-request-"+suffix,type:"switch_goal",target_goal_id:"fixture-other-goal-"+suffix};const keys=Object.keys(row);
    api.run(`INSERT INTO v2_requests (${keys.map(identifier).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`,...keys.map(k=>row[k]));
  }
  const before=()=>hash(stable([...tables].map(([name,t])=>({name,rows:rows(db,name,t.columns.map(c=>c.name))}))));
  function trial(name,fn,reject=true,expectedErrcode) {
    const initial=before();db.exec("SAVEPOINT fixture_trial");let error,value;
    try{value=fn();}catch(e){error=e;}
    finally{db.exec("ROLLBACK TO fixture_trial");db.exec("RELEASE fixture_trial");}
    if(reject){assert(error,"Expected rejection: "+name);if(expectedErrcode!==undefined)assert.equal(error.errcode,expectedErrcode,name);}
    else if(error)throw error;
    assert.equal(before(),initial,"Probe changed persistent fixture rows: "+name);
    cases.push({name,rejected:!!error,error:error?normalized(error):null,value:value??null,passed:true});
  }
  let fkProbes=0;
  for(const [name,table] of tables) {
    const groups=new Map();for(const row of table.foreign_keys){if(!groups.has(row.id))groups.set(row.id,[]);groups.get(row.id).push(row);}
    for(const [id,fields] of groups) {
      fields.sort((a,b)=>a.seq-b.seq);
      const column=fields.at(-1).from,meta=table.columns.find(c=>c.name===column);
      const first=db.prepare(`SELECT rowid AS fixture_rowid FROM ${identifier(name)} WHERE ${fields.map(f=>identifier(f.from)+" IS NOT NULL").join(" AND ")} LIMIT 1`).get();
      assert(first,"No populated foreign-key fixture: "+name+"/"+id);
      const missing=meta.type==="INTEGER"?999999999:"fixture-missing-reference-"+name+"-"+id;
      trial("foreign-key/"+name+"/"+id,()=>api.run(`UPDATE ${identifier(name)} SET ${identifier(column)}=? WHERE rowid=?`,missing,first.fixture_rowid),true,787);fkProbes++;
    }
  }
  const cross=[
    ["v2_pod_members","pod_id","fixture-pod-b"],["v2_goals","pod_id","fixture-pod-b"],
    ["v2_alignments","target_goal_id","fixture-goal-b"],["v2_sessions","governing_goal_id","fixture-goal-b"],
    ["v2_epochs","goal_id","fixture-goal-b"],["v2_alignment_sessions","alignment_id","fixture-alignment-b"],
    ["v2_usage","epoch_id","fixture-epoch-b"],["v2_directive_targets","directive_id","fixture-directive-b"],
    ["v2_receipts","directive_id","fixture-directive-b"],["v2_change_requests","goal_id","fixture-goal-b"],
    ["v2_change_request_revisions","change_request_id","fixture-change-approved-b"],
    ["v2_oauth_grants","user_id","fixture-member-b"],["v2_goal_holds","goal_id","fixture-goal-b"],
    ["v2_asks","team_id","fixture-pod-b"],["v2_value_reports","change_request_id","fixture-change-approved-b"],
    ["v2_request_targets","request_id","fixture-request-b"],["v2_oauth_goal_sends","goal_id","fixture-goal-b"],
  ];
  for(const [table,column,value]of cross)trial("cross-workspace/"+table+"/"+column,()=>api.run(`UPDATE ${identifier(table)} SET ${identifier(column)}=?${table==="v2_change_request_revisions"?",revision=999":""} WHERE rowid=(SELECT rowid FROM ${identifier(table)} WHERE ws_id=? LIMIT 1)`,value,"fixture-ws-a"),true,787);
  for(const [name,sql,args]of [
    ["member-role","UPDATE v2_members SET role=? WHERE ws_id=? AND user_id=?",["admin","fixture-ws-a","fixture-member-a"]],
    ["goal-visibility","UPDATE v2_goals SET visibility=? WHERE id=?",["unknown","fixture-goal-a"]],
    ["pod-goal-without-pod","UPDATE v2_goals SET visibility='pod',pod_id=NULL WHERE id=?",["fixture-goal-a"]],
    ["company-goal-with-pod","UPDATE v2_goals SET level='company' WHERE id=?",["fixture-goal-a"]],
    ["target-share-low","UPDATE v2_goals SET target_share=? WHERE id=?",[-1,"fixture-goal-a"]],
    ["target-share-high","UPDATE v2_goals SET target_share=? WHERE id=?",[101,"fixture-goal-a"]],
    ["session-state","UPDATE v2_sessions SET state=? WHERE session_key=?",["running","fixture-session-a"]],
    ["session-harness","UPDATE v2_sessions SET harness=? WHERE session_key=?",["unknown","fixture-session-a"]],
    ["epoch-authority","UPDATE v2_epochs SET authority=? WHERE session_key=?",["unknown","fixture-session-a"]],
    ["request-target-mismatch","UPDATE v2_requests SET target_goal_id=? WHERE id=?",["fixture-goal-a","fixture-request-a"]],
    ["switch-without-target","UPDATE v2_requests SET type='switch_goal',target_goal_id=NULL WHERE id=?",["fixture-request-a"]],
    ["request-note-too-long","UPDATE v2_requests SET note=? WHERE id=?",["x".repeat(281),"fixture-request-a"]],
    ["hold-reason-too-long","UPDATE v2_goal_holds SET reason=? WHERE ws_id=?",["x".repeat(281),"fixture-ws-a"]],
    ["value-note-too-long","UPDATE v2_value_reports SET note=? WHERE id=?",["x".repeat(501),"fixture-value-report-a"]],
    ["revision-condition-too-long","UPDATE v2_change_request_revisions SET condition=? WHERE change_request_id=?",["x".repeat(2001),"fixture-change-approved-a"]],
    ["revision-condition-empty","UPDATE v2_change_request_revisions SET condition='' WHERE change_request_id=?",["fixture-change-approved-a"]],
    ["receipt-auto-without-accepted","UPDATE v2_receipts SET auto_accepted=1 WHERE ws_id=?",["fixture-ws-a"]],
    ["receipt-auto-not-boolean","UPDATE v2_receipts SET state='accepted',auto_accepted=2 WHERE ws_id=?",["fixture-ws-a"]],
    ["request-auto-not-boolean","UPDATE v2_request_targets SET auto_accepted=2 WHERE ws_id=?",["fixture-ws-a"]],
    ["request-ended-reason","UPDATE v2_request_targets SET ended_reason='unknown' WHERE ws_id=?",["fixture-ws-a"]],
    ["steering-share-high","UPDATE v2_steering_events SET share=101 WHERE ws_id=?",["fixture-ws-a"]],
    ["steering-target-low","UPDATE v2_steering_events SET target=-1 WHERE ws_id=?",["fixture-ws-a"]],
  ])trial("check/"+name,()=>api.run(sql,...args),true,275);
  for(const [name,sql,args]of [
    ["target-share-zero","UPDATE v2_goals SET target_share=0 WHERE id=?",["fixture-goal-a"]],
    ["target-share-hundred","UPDATE v2_goals SET target_share=100 WHERE id=?",["fixture-goal-a"]],
    ["company-workspace-goal","UPDATE v2_goals SET level='company',pod_id=NULL,visibility='workspace' WHERE id=?",["fixture-goal-a"]],
    ["request-note-boundary","UPDATE v2_requests SET note=? WHERE id=?",["x".repeat(280),"fixture-request-a"]],
    ["value-note-boundary","UPDATE v2_value_reports SET note=? WHERE id=?",["x".repeat(500),"fixture-value-report-a"]],
    ["condition-boundary","UPDATE v2_change_request_revisions SET condition=? WHERE change_request_id=?",["x".repeat(2000),"fixture-change-approved-a"]],
    ["accepted-auto-receipt","UPDATE v2_receipts SET state='accepted',auto_accepted=1 WHERE ws_id=?",["fixture-ws-a"]],
  ])trial("allowed/"+name,()=>{const n=api.run(sql,...args);assert(n>0);return n;},false);
  const clone=(table,changes)=>{
    const old=db.prepare(`SELECT * FROM ${identifier(table)} WHERE ws_id=? LIMIT 1`).get("fixture-ws-a");const value={...old,...changes};const keys=Object.keys(value);
    return api.run(`INSERT INTO ${identifier(table)} (${keys.map(identifier).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`,...keys.map(k=>value[k]));
  };
  trial("unique/open-epoch",()=>clone("v2_epochs",{epoch_id:"fixture-second-open-epoch"}),true,2067);
  trial("allowed/closed-epoch",()=>clone("v2_epochs",{epoch_id:"fixture-closed-epoch",ends_at:"2026-02-01T00:00:00.000Z"}),false);
  trial("unique/open-change-request",()=>{const old=db.prepare("SELECT * FROM v2_change_requests WHERE id='fixture-change-pending-a'").get();const value={...old,id:"fixture-duplicate-open"};const keys=Object.keys(value);return api.run(`INSERT INTO v2_change_requests (${keys.map(identifier).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`,...keys.map(k=>value[k]));},true,2067);
  trial("allowed/closed-change-request",()=>clone("v2_change_requests",{id:"fixture-extra-closed",state:"withdrawn"}),false);
  trial("unique/workspace-event",()=>clone("v2_events",{id:990001}),true,2067);
  trial("unique/person-event",()=>{clone("v2_events",{id:990001,name:"value_card_viewed"});return clone("v2_events",{id:990002,name:"value_card_viewed"});},true,2067);
  trial("allowed/null-actor-events",()=>{clone("v2_events",{id:990001,name:"value_card_viewed",actor:null});return clone("v2_events",{id:990002,name:"value_card_viewed",actor:null});},false);
  trial("unique/former-member",()=>clone("v2_former_members",{user_id:"fixture-viewer-a",n:null}),true,2067);
  trial("unique/former-member-number",()=>clone("v2_former_members",{user_id:null,n:17}),true,2067);
  for(const [column,value]of [["id",990001],["name","fixture-changed"],["at","2027-01-01T00:00:00.000Z"],["props",'{"fixture":true}']]) {
    trial("event-immutable/"+column,()=>api.run(`UPDATE v2_events SET ${identifier(column)}=? WHERE id=11`,value),true,1811);
    trial("event-immutable/no-op-"+column,()=>api.run(`UPDATE v2_events SET ${identifier(column)}=${identifier(column)} WHERE id=11`),true,1811);
  }
  trial("allowed/event-privacy-fields",()=>{assert.equal(api.run("UPDATE v2_events SET actor=NULL,ws_id=? WHERE id=11","fixture-purged-workspace"),1);const row=api.get("SELECT actor,ws_id,name FROM v2_events WHERE id=11");assert.equal(row.actor,null);assert.equal(row.ws_id,"fixture-purged-workspace");assert.equal(row.name,"workspace_created");return 1;},false);
  for(const props of ["[]","null","1",'"text"',"{"])trial("event-json/"+props,()=>clone("v2_events",{id:990001,name:"fixture-json-check",props}));
  trial("allowed/event-object",()=>clone("v2_events",{id:990001,name:"fixture-json-check",props:'{"fixture":true}'}),false);
  trial("cascade/oauth-grant",()=>{assert.equal(api.run("DELETE FROM v2_oauth_grants WHERE id=?","fixture-grant-a"),1);assert.equal(api.get("SELECT count(*) AS n FROM v2_oauth_goal_sends WHERE grant_id=?","fixture-grant-a").n,0);assert.equal(api.get("SELECT count(*) AS n FROM v2_oauth_goal_sends WHERE grant_id=?","fixture-grant-b").n,1);return 1;},false);
  trial("set-null/deleted-device",()=>{assert.equal(api.run("DELETE FROM v2_devices WHERE id=?","fixture-device-a"),1);assert.equal(api.get("SELECT device_id FROM v2_sessions WHERE session_key=?","fixture-session-a").device_id,null);assert.equal(api.get("SELECT count(*) AS n FROM v2_device_tokens WHERE device_id=?","fixture-device-a").n,0);return 1;},false);
  trial("membership-departure/history-kept",()=>{assert.equal(api.run("DELETE FROM v2_members WHERE ws_id=? AND user_id=?","fixture-ws-a","fixture-member-a"),1);assert(api.get("SELECT id FROM v2_goals WHERE id=?","fixture-source-goal-a"));assert(api.get("SELECT id FROM v2_alignments WHERE id=?","fixture-alignment-a"));assert(api.get("SELECT session_key FROM v2_sessions WHERE session_key=?","fixture-session-a"));assert.equal(api.get("SELECT count(*) AS n FROM v2_oauth_grants WHERE id=?","fixture-grant-a").n,0);return 1;},false);
  assert.equal(fkProbes,71);assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
return cases;}finally{db.close();}}
function recovery(programs,version){
 const db=open(),collisions={2:"v2_activity",12:"v2_requests",22:"v2_oauth_goal_sends"};
 try{const start=version-1;apply(db,programs,0,start);seeded(db,start);const name=collisions[version];db.exec("CREATE TABLE "+q(name)+" (sentinel TEXT NOT NULL); INSERT INTO "+q(name)+" VALUES ('owned collision');");const before=state(db,true);let error;try{apply(db,programs,start,23);}catch(e){error=e;}assert(error);const failed=state(db,true);assert.deepEqual(failed,before,"Failed change did not restore all prior state");db.exec("DROP TABLE "+q(name));apply(db,programs,start,23);return {error:errors(error),failed,after:state(db,true)};}finally{db.close();}
}
function vectors(){return [{kind:"collection"},...Array.from({length:24},(_,version)=>({kind:"shape",version})),...Array.from({length:23},(_,i)=>({kind:"populated",version:i+1})),{kind:"physical"},{kind:"constraints"},...[2,12,22].map(version=>({kind:"recovery",version}))];}
function observation(get,vector){const programs=programCollection(get);if(vector.kind==="collection"){programs.forEach(permitted);return {programs:programs.length,fresh:true,stable:true};}if(vector.kind==="shape")return shape(programs,vector.version);if(vector.kind==="populated")return populated(programs,vector.version);if(vector.kind==="physical")return physical(programs);if(vector.kind==="constraints")return constraintCases(programs);if(vector.kind==="recovery")return recovery(programs,vector.version);throw Error("Unknown observer vector");}
function run(get,index){const vector=vectors()[index];assert(vector);const seen=observation(get,vector);return {kind:vector.kind,observations:Array.isArray(seen)?seen.length:1,sha256:hash(stable({vector,seen}))};}
function baseline(root){const source=fs.readFileSync(path.join(root,"changes.ts"),"utf8");assert.equal(hash(source),SOURCE_SHA);const code=stripTypeScriptTypes(source,{mode:"strip"}),programs=new Function(code+"\nreturn MIGRATIONS;")();assert.equal(programs.length,23);return ()=>programs.slice();}
async function generated(root,surface){const binding=surface?.capabilities.find(c=>c.capability===CAPABILITY);if(surface)assert(binding?.symbols.includes(SYMBOL));const modulePath=binding?.module||MODULE,files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name.startsWith(".")||e.name==="node_modules")continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(c|m)?js$/.test(e.name))files.push(f);}}walk(root);const normalize=p=>p.replaceAll(path.sep,"/");const matches=files.filter(f=>[".js",".cjs",".mjs"].some(s=>normalize(f).endsWith("/"+modulePath+s)));assert.equal(matches.length,1);const m=await import(pathToFileURL(matches[0]).href),fn=m[SYMBOL]??m.default?.[SYMBOL];assert.equal(typeof fn,"function");return ()=>fn();}
async function main(){if(["--baseline","--generated"].includes(process.argv[1])){const [mode,raw]=process.argv.slice(1),[index]=JSON.parse(raw),get=mode==="--baseline"?baseline(process.cwd()):await generated(process.cwd());process.stdout.write(JSON.stringify(run(get,index))+"\n");}else{const [root,surfaceRaw,casesRaw]=process.argv.slice(2),get=await generated(root,JSON.parse(surfaceRaw)),cases=[];for(const c of JSON.parse(casesRaw)){assert.equal(c.capability,CAPABILITY);cases.push({case_id:c.case_id,capability:CAPABILITY,result:run(get,c.arguments[0])});}process.stdout.write(JSON.stringify({schema:"literate-ai/library-acceptance-results@1",cases})+"\n");}}
module.exports={CAPABILITY,SYMBOL,MODULE,Model,vectors,baseline,generated,run,observation,shape,populated,physical,constraintCases,recovery,permitted,normalizeModel,predicateIsTotal,declaredCheckOrder:DECLARED_CHECK_ORDER};
if(require.main===module||["--baseline","--generated"].includes(process.argv[1]))main().catch(e=>{console.error(e.stack||e);process.exit(1);});

};

// Private verifier module: /__private__/storage-event-integrity/storage-fixtures.cjs
modules["/__private__/storage-event-integrity/storage-fixtures.cjs"] = function(require,module,exports,__filename,__dirname) {
"use strict";
// Synthetic records for isolated storage acceptance only.
const assert = require("node:assert/strict");
module.exports = function storageFixtures(inventory) {
const T="2026-01-01T00:00:00.000Z", LATER="2026-02-01T00:00:00.000Z";
const identifier=n=>'"'+n.replaceAll('"','""')+'"';
const stable=value=>JSON.stringify(value,(_key,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function rows(db,table,columns) {
  return db.prepare(`SELECT ${columns.map(identifier).join(",")} FROM ${identifier(table)}`).all().map(r=>JSON.parse(JSON.stringify(r))).sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0);
}
function seed(db,version) {
  const tables=new Map(inventory.snapshots[version].tables.map(t=>[t.name,t]));
  const added=new Map();
  function add(name,data) {
    const table=tables.get(name);if(!table)return;
    const keys=table.columns.map(c=>c.name).filter(k=>Object.hasOwn(data,k)&&data[k]!==undefined);
    for(const c of table.columns)if(c.notnull&&c.dflt_value===null&&!keys.includes(c.name))throw new Error("Missing explicit fixture field "+name+"."+c.name);
    db.prepare(`INSERT INTO ${identifier(name)} (${keys.map(identifier).join(",")}) VALUES (${keys.map(()=>"?").join(",")})`).run(...keys.map(k=>data[k]));
    added.set(name,(added.get(name)||0)+1);
  }
  for(const s of ["a","b"]) {
    const ws="fixture-ws-"+s,owner="fixture-owner-"+s,member="fixture-member-"+s,viewer="fixture-viewer-"+s;
    const pod="fixture-pod-"+s,goal="fixture-goal-"+s,other="fixture-other-goal-"+s,source="fixture-source-goal-"+s;
    const device="fixture-device-"+s,session="fixture-session-"+s,alignment="fixture-alignment-"+s;
    const directive="fixture-directive-"+s,requestDirective="fixture-request-directive-"+s,holdDirective="fixture-hold-directive-"+s;
    const epoch="fixture-epoch-"+s,grant="fixture-grant-"+s,request="fixture-request-"+s,reallocation="fixture-reallocation-"+s;
    const approvedCR="fixture-change-approved-"+s,ask="fixture-ask-"+s,seq=(s==="a"?10:20);
    for(const user of [owner,member,viewer])db.prepare("INSERT INTO ba_user(id) VALUES(?)").run(user);
    db.prepare("INSERT INTO ba_passkey(id) VALUES(?)").run("fixture-passkey-"+s);
    add("v2_workspaces",{id:ws,name:"Fixture workspace "+s,created_by:owner,created_at:T,deleted_at:null,steering:"on"});
    for(const [user,role] of [[owner,"owner"],[member,"member"],[viewer,"viewer"]])add("v2_members",{ws_id:ws,user_id:user,role,created_at:T});
    add("v2_pods",{id:pod,ws_id:ws,name:"Fixture team "+s,created_at:T});
    add("v2_pod_members",{ws_id:ws,pod_id:pod,user_id:owner,role:"lead",created_at:T});
    add("v2_pod_members",{ws_id:ws,pod_id:pod,user_id:member,role:"member",created_at:T});
    add("v2_invites",{id:"fixture-invite-"+s,ws_id:ws,token_hash:"fixture-invite-hash-"+s,email:"invite-"+s+"@fixture.invalid",role:"member",created_by:owner,created_at:T,expires_at:LATER,accepted_at:null,accepted_by:null,team_id:pod,team_role:"member"});
    for(const [id,user] of [[goal,owner],[other,owner],[source,member]]) {
      add("v2_goals",{id,ws_id:ws,owner_id:user,pod_id:pod,visibility:"workspace",version:1,title:"Fixture café "+id,measures_json:'[{"id":"fixture-measure","text":"Keep bytes"}]',anchors_json:'["fixture-anchor"]',status:"active",created_at:T,updated_at:LATER,depends_on_json:"[]",level:"team",limits_json:'[{"id":"fixture-limit","value":5}]',target_share:40});
      add("v2_goal_versions",{ws_id:ws,goal_id:id,version:1,title:"Fixture café "+id,measures_json:'[{"id":"fixture-measure","text":"Keep bytes"}]',anchors_json:'["fixture-anchor"]',status:"active",content_hash:"fixture-content-hash-"+id,created_by:user,created_at:T,depends_on_json:"[]",limits_json:'[{"id":"fixture-limit","value":5}]',target_share:40});
    }
    add("v2_goal_acks",{ws_id:ws,goal_id:source,parent_id:goal,parent_version:1,at:T});
    add("v2_audit",{seq:seq+1,ws_id:ws,actor_id:owner,action:"fixture.action",object_id:goal,at:T});
    add("v2_devices",{id:device,user_id:member,name:"Fixture machine "+s,public_key:"fixture-public-key-"+s,created_at:T,last_seen_at:LATER,revoked_at:null,revoked_reason:null,replaces:"fixture-prior-device-"+s});
    add("v2_device_requests",{id:"fixture-device-request-"+s,device_code_hash:"fixture-device-code-hash-"+s,user_code:"FIXTURE-"+s.toUpperCase(),device_name:"Fixture machine "+s,public_key:"fixture-public-key-"+s,created_at:T,expires_at:LATER,interval_s:5,last_poll_at:T,state:"approved",user_id:member,ws_ids_json:JSON.stringify([ws]),device_id:device,approved_name:"Fixture approved machine "+s});
    add("v2_device_grants",{device_id:device,ws_id:ws});
    for(const kind of ["access","refresh"])add("v2_device_tokens",{token_hash:"fixture-token-hash-"+kind+"-"+s,device_id:device,kind,created_at:T,expires_at:LATER,rotated_at:null});
    add("v2_alignments",{id:alignment,ws_id:ws,requester_id:member,target_goal_id:goal,source_goal_id:source,state:"approved",revision:1,created_at:T,updated_at:LATER,decided_at:LATER,revoked_at:null,revoked_by:null});
    add("v2_alignment_revisions",{ws_id:ws,alignment_id:alignment,revision:1,choice:"contribution",effects_json:'{"fixture":"effect"}',approvers_json:JSON.stringify([owner]),note:"Fixture note 東京",author_id:member,created_at:T});
    add("v2_alignment_approvals",{ws_id:ws,alignment_id:alignment,revision:1,user_id:owner,at:LATER});
    add("v2_sessions",{ws_id:ws,session_key:session,user_id:member,device_id:device,harness:"codex",repo_key:"fixture-repo-key-"+s,repo_alias:"Fixture repository",title:"Fixture session café",started_at:T,state:"shared",stopped_at:null,governing_goal_id:goal,governing_alignment_id:alignment,agent_stopped:0,conflicts:1,created_at:T,updated_at:LATER,ended_reason:null});
    add("v2_alignment_sessions",{ws_id:ws,alignment_id:alignment,revision:1,session_key:session});
    add("v2_epochs",{ws_id:ws,session_key:session,epoch_id:epoch,goal_id:goal,goal_version_at_start:1,starts_at:T,ends_at:null,root_turn:"fixture-root-turn",cause:"fixture-cause",authority:"alignment",alignment_id:alignment,created_at:T});
    add("v2_usage",{ws_id:ws,session_key:session,request_key:"fixture-request-key-"+s,epoch_id:epoch,ts:T,model:"fixture-model",query_source:"fixture-query",input:123,output:45,cache_read:67,cache_write_5m:8,cache_write_1h:9,cache_write_unsplit:10,basis:"fixture-basis",est_list_usd_micros:1234567,price_table_version:"fixture-prices",source:"fixture-source",received_at:LATER});
    add("v2_directives",{seq:seq+1,id:directive,ws_id:ws,kind:"goal_version",goal_id:goal,goal_json:'{"fixture":"goal"}',binding_json:'{"fixture":"binding"}',created_at:T,request_json:null,hold_json:null});
    if(version>=12) {
      add("v2_directives",{seq:seq+2,id:requestDirective,ws_id:ws,kind:"request",goal_id:goal,goal_json:null,binding_json:null,created_at:T,request_json:'{"fixture":"request"}',hold_json:null});
      add("v2_directives",{seq:seq+3,id:holdDirective,ws_id:ws,kind:"hold",goal_id:goal,goal_json:null,binding_json:null,created_at:T,request_json:null,hold_json:'{"fixture":"hold"}'});
    }
    add("v2_directive_targets",{ws_id:ws,directive_id:directive,session_key:session});
    add("v2_receipts",{ws_id:ws,directive_id:directive,session_key:session,state:"applied",at:T,recorded_at:LATER,auto_accepted:0});
    add("v2_activity",{seq:seq+1,ws_id:ws,session_key:session,user_id:member,goal_id:goal,repo_id:"fixture-repo-"+s,kind:"edit",path_hash:"fixture-path-hash-"+s,path:"fixture/file.ts",text:null,at:T,expires_at:LATER});
    add("v2_oauth_grants",{id:grant,ws_id:ws,user_id:member,client_id:"https://fixture.invalid/client/"+s,client_name:"Fixture app "+s,redirect_host:"fixture.invalid",created_at:T,last_used_at:LATER,refresh_hash:"fixture-refresh-hash-"+s,prev_refresh_hash:"fixture-prior-refresh-hash-"+s,refresh_exp:1900000000,kid:"fixture-key-"+s,scope:"goals:read changes:evidence",last_read_at:LATER});
    for(const state of ["pending","countered","approved","rejected","withdrawn","superseded"]) {
      const id="fixture-change-"+state+"-"+s;
      add("v2_change_requests",{id,ws_id:ws,goal_id:state==="countered"?other:goal,requester_id:member,state,revision:1,base_version:1,changes_json:'{"title":"Fixture changed café"}',reason:"Fixture reason "+state,approved_by:state==="approved"?owner:null,rejected_by:state==="rejected"?owner:null,decision_note:"Fixture decision",version:state==="approved"?2:null,created_at:T,updated_at:LATER,decided_at:state==="pending"||state==="countered"?null:LATER,approved_without_evidence:state==="approved"?1:null,launch:state==="approved"?"not_yet":null,approved_json:state==="approved"?'{"title":"Fixture approved"}':null,launch_by:state==="approved"?owner:null,launch_at:state==="approved"?LATER:null});
      add("v2_change_request_revisions",{ws_id:ws,change_request_id:id,revision:1,base_version:1,changes_json:'{"title":"Fixture changed café"}',note:"Fixture revision 東京",author_id:member,created_at:T,snapshot_json:'{"fixture":"snapshot"}',condition:"Fixture condition",acknowledged_by:member,acknowledged_at:LATER});
    }
    add("v2_spend_rollups",{ws_id:ws,goal_id:goal,day:"2026-01-01",model:"fixture-model",basis:"fixture-basis",requests:2,input:123,output:45,cache_read:67,cache_write_5m:8,cache_write_1h:9,cache_write_unsplit:10,est_list_usd_micros:1234567,unpriced_requests:1});
    add("v2_former_members",{ws_id:ws,user_id:viewer,n:null,removed_at:T,pseudonymised_at:null});
    add("v2_former_members",{ws_id:ws,user_id:null,n:17,removed_at:T,pseudonymised_at:LATER});
    add("v2_passkey_use",{passkey_id:"fixture-passkey-"+s,last_used_at:LATER});
    add("v2_passkey_prompt_dismissed",{user_id:owner,dismissed_at:T});
    add("v2_creation_codes",{id:"fixture-code-"+s,code_hash:"fixture-code-hash-"+s,email:"owner-"+s+"@fixture.invalid",request_id:"fixture-access-"+s,created_at:T,expires_at:LATER,revoked_at:null,redeemed_at:LATER,redeemed_by:owner,ws_id:ws});
    add("v2_access_requests",{id:"fixture-access-"+s,email:"owner-"+s+"@fixture.invalid",name:"Fixture owner "+s,company:"Fixture company",team_size:"2-5",use_case:"Fixture use case",interest:"evaluate",status:"approved",created_at:T,decided_at:LATER,code_id:"fixture-code-"+s});
    add("v2_rate_hits",{key:"fixture-rate-"+s,at:1767225600000});
    add("v2_change_request_evidence",{id:"fixture-evidence-"+s,ws_id:ws,change_request_id:approvedCR,revision:1,kind:"doc",url:"https://fixture.invalid/doc/"+s,label:"Fixture evidence",source:"person",added_by:owner,added_at:T});
    add("v2_events",{id:seq+1,name:"workspace_created",ws_id:ws,actor:"fixture-actor-hash-"+s,at:T,props:'{"kind":"blank"}'});
    add("v2_asks",{id:ask,ws_id:ws,team_id:pod,goal_id:goal,text:"Fixture ask 東京",from_label:"Fixture meeting",created_by:member,source_kind:"meeting",source_title:"Fixture source",source_date:"2026-01-01",state:"accepted",decided_by:owner,decided_at:LATER,created_at:T,updated_at:LATER});
    add("v2_ask_mentions",{ws_id:ws,ask_id:ask,n:1,date:"2026-01-01",text:"Fixture mention",source_title:"Fixture source",added_by:member,added_at:T});
    add("v2_value_reports",{id:"fixture-value-report-"+s,ws_id:ws,change_request_id:approvedCR,person_id:member,estimate:"about_a_week",note:"Fixture value note",created_at:T,updated_at:LATER});
    add("v2_requests",{id:request,ws_id:ws,goal_id:goal,type:"checkpoint",target_goal_id:null,goal_version:1,note:"Fixture request",sender_id:owner,sender_role:"owner",directive_id:requestDirective,created_at:T,cancelled_at:null,cancelled_by:null});
    add("v2_request_targets",{ws_id:ws,request_id:request,session_key:session,state:"accepted",auto_accepted:1,updated_at:LATER,ended_reason:null});
    add("v2_goal_holds",{ws_id:ws,goal_id:goal,held_by:owner,reason:"Fixture hold",held_at:T,directive_id:holdDirective});
    add("v2_steering_events",{ws_id:ws,session_key:session,goal_id:goal,suggested_goal_id:other,share:20,target:40,at:T,recorded_at:LATER});
    add("v2_reallocations",{id:reallocation,ws_id:ws,requester_id:member,state:"approved",revision:1,launch:"pending",launch_by:owner,launch_at:LATER,decided_by:owner,decision_note:"Fixture decision",created_at:T,updated_at:LATER,decided_at:LATER});
    add("v2_reallocation_revisions",{ws_id:ws,reallocation_id:reallocation,revision:1,targets_json:JSON.stringify([{goal_id:goal,target_share:40},{goal_id:other,target_share:60}]),note:"Fixture revision",author_id:member,created_at:T});
    add("v2_reallocation_approvals",{ws_id:ws,reallocation_id:reallocation,revision:1,goal_id:goal,user_id:owner,at:LATER});
    add("v2_deleted_sessions",{ws_id:ws,key_hash:"fixture-deleted-key-hash-"+s,deleted_at:T});
    add("v2_oauth_goal_sends",{grant_id:grant,ws_id:ws,goal_id:goal,version:1,sent_at:LATER});
  }
  for(const [name,table] of tables) {
    assert((added.get(name)||0)>0,"Every table present must contain fixture data: "+name);
    if(table.non_reusing_sequence) {
      const first=db.prepare(`SELECT * FROM ${identifier(name)} LIMIT 1`).get();
      const primary=table.columns.find(c=>c.pk===1&&c.type==="INTEGER").name;
      const clone={...first,[primary]:9000000};
      if(name==="v2_directives")clone.id="fixture-deleted-high-directive";
      if(name==="v2_events"){clone.name="value_card_viewed";clone.actor="fixture-deleted-high-actor";}
      add(name,clone);db.prepare(`DELETE FROM ${identifier(name)} WHERE ${identifier(primary)}=?`).run(9000000);
    }
  }
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0,"Populated fixture must be valid before migration");
  return tables;
}

return {seed,rows,stable,identifier,T,LATER};
};

};

// Private verifier module: /__private__/storage-event-integrity/policy-controls.cjs
modules["/__private__/storage-event-integrity/policy-controls.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const legacy=require('./schema-observations.cjs'),seedFactory=require('./storage-fixtures.cjs');
const {change_programs}=require('./qualified-base22.cjs'),{extend_device_refresh_schema}=require('./qualified-refresh23.cjs');
const prior=()=>extend_device_refresh_schema(change_programs());
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function open(){const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:true});db.exec('CREATE TABLE ba_user(id TEXT PRIMARY KEY); CREATE TABLE ba_passkey(id TEXT PRIMARY KEY);');return db;}
function apply(db,programs,from,to){db.exec('PRAGMA foreign_keys=OFF');try{for(let v=from+1;v<=to;v++){legacy.permitted(programs[v-1]);db.exec('BEGIN IMMEDIATE');try{db.exec(programs[v-1]);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.exec('PRAGMA user_version='+v);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}}finally{db.exec('PRAGMA foreign_keys=ON');}}
function seed(db,v){const tables=legacy.Model.observe(db).map(t=>({...t,non_reusing_sequence:legacy.Model.tableModel(t).non_reusing_sequence})),snapshots=[];snapshots[v]={tables};seedFactory({snapshots}).seed(db,v);}
function state(db){return {version:db.prepare('PRAGMA user_version').get().user_version,fk:db.prepare('PRAGMA foreign_keys').get().foreign_keys,meta:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),data:db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM '+JSON.stringify(name)).all().map(x=>JSON.stringify(x)).sort()])};}
function data(db){return state(db).data;}
function collection(fn){const input=prior(),before=input.slice(),a=fn(input),b=fn(input);assert.deepEqual(input,before);assert(Array.isArray(a));assert.notEqual(a,input);assert.notEqual(a,b);assert.equal(a.length,24);assert.deepEqual(a.slice(0,23),before);assert.deepEqual(a,b);assert.equal(typeof a[23],'string');assert(a[23].trim());return a;}
const events=[];
function run(fn){
 const programs=collection(fn);const rows=[];
 for(let i=0;i<53;i++)rows.push({kind:'preserved-legacy',index:i,result:legacy.run(()=>programs.slice(0,23),i)});
 for(let from=0;from<=23;from++){
  const db=open();try{apply(db,programs,0,from);if(from)seed(db,from);apply(db,programs,from,23);const before=data(db),beforeMeta=state(db).meta;apply(db,programs,23,24);assert.deepEqual(data(db),before);const afterMeta=state(db).meta;assert.deepEqual(afterMeta.filter(x=>x.name!=='v2_events_attribution_guard'),beforeMeta);const added=afterMeta.filter(x=>x.name==='v2_events_attribution_guard');assert.equal(added.length,1);assert.equal(added[0].type,'trigger');assert.equal(added[0].tbl_name,'v2_events');assert.equal(db.prepare('PRAGMA user_version').get().user_version,24);assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='trigger' AND name IN ('v2_events_append_only','v2_events_attribution_guard')").get().n,2);rows.push({kind:'populated-upgrade',from,preserved_tables:before.length});}finally{db.close();}
 }
 const db=open();try{
  apply(db,programs,0,23);seed(db,23);apply(db,programs,23,24);
  const workspaces=db.prepare('SELECT id FROM v2_workspaces ORDER BY id').all().map(x=>x.id);assert(workspaces.length>=2);const [ws,other]=workspaces;const insert=db.prepare("INSERT INTO v2_events(name,ws_id,actor,at,props) VALUES ('owned_integrity_probe',?,?,'2031-02-03T04:05:06.000Z','{}')");
  function trial(name,body){db.exec('SAVEPOINT owned_probe');try{body();rows.push({kind:'policy',name,passed:true});}finally{db.exec('ROLLBACK TO owned_probe; RELEASE owned_probe');}}
  function refused(update,args=[]){const before=data(db);let error;try{db.prepare(update).run(...args);}catch(e){error=e;}assert(error,'Expected event integrity refusal');assert.equal(error.errcode,1811);assert.deepEqual(data(db),before);}
  for(const [name,target] of [['identified',other],['arbitrary','owned-arbitrary'],['empty',''],['null',null],['short','wsx_a'],['upper','wsx_'+'A'.repeat(24)],['numeric','wsx_'+'0'.repeat(24)],['long','wsx_'+'a'.repeat(25)],['bad-suffix','wsx_'+'a'.repeat(23)+'!']])trial('refuse-workspace-'+name,()=>{insert.run(ws,'owned-actor');refused("UPDATE v2_events SET ws_id=? WHERE name='owned_integrity_probe'",[target]);});
  for(const actor of ['owned-other','',1])trial('refuse-actor-'+String(actor),()=>{insert.run(ws,'owned-actor');refused("UPDATE v2_events SET actor=? WHERE name='owned_integrity_probe'",[actor]);});
  trial('null-actor-cannot-acquire-attribution',()=>{insert.run(ws,null);refused("UPDATE v2_events SET actor='owned-actor' WHERE name='owned_integrity_probe'");});
  trial('null-workspace-cannot-acquire-attribution',()=>{insert.run(null,'owned-actor');refused("UPDATE v2_events SET ws_id=? WHERE name='owned_integrity_probe'",['wsx_'+'a'.repeat(24)]);});
  trial('anonymous-workspace-cannot-be-rekeyed',()=>{insert.run('wsx_'+'a'.repeat(24),'owned-actor');refused("UPDATE v2_events SET ws_id=? WHERE name='owned_integrity_probe'",['wsx_'+'b'.repeat(24)]);});
  trial('mixed-redaction-update-is-atomic',()=>{insert.run(ws,'owned-actor');insert.run('wsx_'+'b'.repeat(24),'owned-actor2');refused("UPDATE v2_events SET ws_id=? WHERE name='owned_integrity_probe'",['wsx_'+'a'.repeat(24)]);});
  trial('no-op-attribution-is-valid',()=>{insert.run(ws,'owned-actor');db.exec("UPDATE v2_events SET ws_id=ws_id,actor=actor WHERE name='owned_integrity_probe'");});
  trial('account-and-retention-clear-actor',()=>{insert.run(ws,'owned-actor');db.exec("UPDATE v2_events SET actor=NULL WHERE name='owned_integrity_probe'");assert.equal(db.prepare("SELECT actor FROM v2_events WHERE name='owned_integrity_probe'").get().actor,null);});
  trial('multi-event-workspace-redaction',()=>{insert.run(ws,'owned-actor');insert.run(ws,'owned-actor2');const anon='wsx_'+'a'.repeat(24);const result=db.prepare("UPDATE v2_events SET ws_id=?,actor=NULL WHERE name='owned_integrity_probe'").run(anon);assert.equal(Number(result.changes),2);const found=db.prepare("SELECT ws_id,actor FROM v2_events WHERE name='owned_integrity_probe'").all();assert(found.every(x=>x.ws_id===anon&&x.actor===null));refused("UPDATE v2_events SET ws_id=? WHERE name='owned_integrity_probe'",[other]);});
  for(const [column,value] of [['id',990001],['name','changed'],['at','2032-01-01'],['props','{"changed":true}']])trial('original-immutable-'+column,()=>{insert.run(ws,'owned-actor');refused('UPDATE v2_events SET '+column+"=? WHERE name='owned_integrity_probe'",[value]);});
  trial('old-immutable-no-op-still-refused',()=>{insert.run(ws,'owned-actor');refused("UPDATE v2_events SET props=props WHERE name='owned_integrity_probe'");});
  trial('retention-delete-remains-valid',()=>{insert.run(ws,'owned-actor');assert.equal(Number(db.prepare("DELETE FROM v2_events WHERE name='owned_integrity_probe'").run().changes),1);});
  trial('privacy-transaction-rollback',()=>{insert.run(ws,'owned-actor');const before=data(db);db.exec('SAVEPOINT privacy');db.prepare("UPDATE v2_events SET ws_id=? WHERE name='owned_integrity_probe'").run('wsx_'+'a'.repeat(24));db.exec('ROLLBACK TO privacy; RELEASE privacy');assert.deepEqual(data(db),before);});
 }finally{db.close();}
 const collision=open();try{apply(collision,programs,0,23);seed(collision,23);collision.exec("CREATE TRIGGER v2_events_attribution_guard BEFORE INSERT ON v2_events BEGIN SELECT 1; END");const before=state(collision);let error;try{apply(collision,programs,23,24);}catch(e){error=e;}assert(error);assert.deepEqual(state(collision),before);rows.push({kind:'failed-migration-rollback',passed:true});}finally{collision.close();}
 for(const input of [[],['opaque'],['','café\n漢字'],Object.freeze(prior())]){const before=input.slice();const a=fn(input),b=fn(input);assert.deepEqual(input,before);assert.notEqual(a,input);assert.notEqual(a,b);assert.deepEqual(a.slice(0,-1),before);assert.deepEqual(a,b);assert.equal(a.at(-1),programs[23]);rows.push({kind:'binding',length:input.length,frozen:Object.isFrozen(input)});}
 return rows;
}
module.exports={run,prior};
if(require.main===module){try{const {extend_event_integrity_schema}=require('./extend_event_integrity_schema.policy-reference.cjs');const rows=run(extend_event_integrity_schema);process.stdout.write(JSON.stringify({schema:'align/authored-event-attribution-policy-results@1',records:rows.length,rows,sha256:hash(rows)})+'\n');}catch(e){console.error(e.stack);process.exitCode=1;}}

};

// Private verifier module: /__private__/storage-event-integrity/binding-fixture.cjs
modules["/__private__/storage-event-integrity/binding-fixture.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
const h=require('./policy-controls.cjs'),cache=new WeakMap();
function semanticBatches(){return [Array.from({length:108},(_,index)=>({operation:0,settings:{index}}))];}
function fixture({index}){return {async run(fn){if(!cache.has(fn))cache.set(fn,h.run(fn));const rows=cache.get(fn);if(rows.length!==108)throw Error('Policy observation count changed');return rows[index];}};}
module.exports={semanticBatches,fixture};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/storage-event-integrity/characterization.json": {
    "batches": [
      {
        "batch": 0,
        "records": 108,
        "sha256": "a80299f4aae515efb05af44173c8173c74e1196ef37bbf8dce86a23138f9111a"
      },
      {
        "batch": 1,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      },
      {
        "batch": 2,
        "records": 0,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ],
    "fault_paths": []
  }
};
const fileNames = {
  "qualified-base22.cjs": "/__private__/storage-event-integrity/qualified-base22.cjs",
  "qualified-refresh23.cjs": "/__private__/storage-event-integrity/qualified-refresh23.cjs",
  "schema-observations.cjs": "/__private__/storage-event-integrity/schema-observations.cjs",
  "storage-fixtures.cjs": "/__private__/storage-event-integrity/storage-fixtures.cjs",
  "policy-controls.cjs": "/__private__/storage-event-integrity/policy-controls.cjs",
  "binding-fixture.cjs": "/__private__/storage-event-integrity/binding-fixture.cjs",
  "characterization.json": "/__private__/storage-event-integrity/characterization.json"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "storage-event-integrity",
  "package": "storage_event_integrity",
  "package_files": [
    "package.json",
    "extend_event_integrity_schema.js"
  ],
  "package_exports": {
    "./extend_event_integrity_schema": "./extend_event_integrity_schema.js"
  },
  "capabilities": [
    {
      "id": "storage-event-integrity.extend-event-integrity-schema",
      "symbol": "extend_event_integrity_schema",
      "module": "extend_event_integrity_schema.js",
      "fixture": "binding-fixture.cjs",
      "cases": "binding-fixture.cjs",
      "characterization": "characterization.json",
      "resource_count": 0,
      "default_operation": 0,
      "runner": false
    }
  ],
  "plans": [
    {
      "capability": "storage-event-integrity.extend-event-integrity-schema",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 108,
        "sha256": "a80299f4aae515efb05af44173c8173c74e1196ef37bbf8dce86a23138f9111a"
      }
    }
  ],
  "files": [
    {
      "name": "qualified-base22.cjs",
      "path": "tools/native-rewrite/qualification/storage-event-integrity-v1/qualified-base22.cjs",
      "sha256": "b6108a502097f942307dd7ba023c173e25a8302511bfa5e316a660345fa90043",
      "size": 64566
    },
    {
      "name": "qualified-refresh23.cjs",
      "path": "tools/native-rewrite/qualification/storage-event-integrity-v1/qualified-refresh23.cjs",
      "sha256": "88ea9632fe9f4463ce8596eecfc785c9a76c863e14540f0d23d342a97d88eeb6",
      "size": 370
    },
    {
      "name": "schema-observations.cjs",
      "path": "tools/native-rewrite/qualification/storage-event-integrity-v1/schema-observations.cjs",
      "sha256": "c45c5e3da9750b1f8c72c1e6607c63aab4616d6305b687d79e8d1b23c411eb67",
      "size": 71152
    },
    {
      "name": "storage-fixtures.cjs",
      "path": "tools/native-rewrite/qualification/storage-event-integrity-v1/storage-fixtures.cjs",
      "sha256": "630ec931bd84e16e6d56af000e186fb287aabc7df7ea08907fc0f519757985a4",
      "size": 13671
    },
    {
      "name": "policy-controls.cjs",
      "path": "tools/native-rewrite/qualification/storage-event-integrity-v1/policy-controls.cjs",
      "sha256": "c152174841cdef5bed666e85d03b3bce2503b6d30c3001b6dacac04f234bcedd",
      "size": 8761
    },
    {
      "name": "binding-fixture.cjs",
      "path": "tools/native-rewrite/qualification/storage-event-integrity-v1/binding-fixture.cjs",
      "sha256": "d7a98a1a639c0e2cd4d0966fc8155e99c1ccaa799da8e1b7aef1cd471e81894a",
      "size": 433
    },
    {
      "name": "characterization.json",
      "path": "tools/native-rewrite/qualification/storage-event-integrity-v1/characterization.json",
      "sha256": "f20fbf68bd10409eb22e492fb8a3ef44e5780634e8390de80a94ecae51156098",
      "size": 447
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
const driver = load("/__private__/storage-event-integrity/driver.cjs");

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
