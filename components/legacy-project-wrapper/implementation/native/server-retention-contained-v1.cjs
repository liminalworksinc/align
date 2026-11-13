'use strict';
// Authored adapter. The historical verifier below is never invoked in this host process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const SETTINGS = {"inner_sha256":"feec85c2c993d454b9d8923a355749f80d0be5189fdd535b193a7fa828b7cd31","package":"server_retention","package_files":["create_retention.js","create_retention_runner.js","package.json"],"maximum_cases":12,"image":"node@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9","cpus":2,"memory_mib":768,"worker_seconds":50};

function historicalVerifier() {'use strict';
// Independent private test code, in readable source. No original service algorithm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modules = Object.create(null);
const loaded = new Map();

// Private verifier module: /__private__/server-retention/driver.cjs
modules["/__private__/server-retention/driver.cjs"] = function(require,module,exports,__filename,__dirname) {
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
    for (let propertyFault = 1; propertyFault <= entry.reads; propertyFault++) properties.push(capability.runner ? {...entry.settings, propertyFault} : {operation: entry.operation, settings: {...entry.settings, propertyFault}});
    for (let effectFault = 1; effectFault <= entry.effects; effectFault++) effects.push(capability.runner ? {...entry.settings, effectFault} : {operation: entry.operation, settings: {...entry.settings, effectFault}});
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

// Private verifier module: /__private__/server-retention/retention-private-storage-seed-v1.cjs
modules["/__private__/server-retention/retention-private-storage-seed-v1.cjs"] = function(require,module,exports,__filename,__dirname) {
"use strict";
// Synthetic records for isolated storage acceptance only.
const assert = require("node:assert/strict");
module.exports = function storageFixtures(inventory) {
const T="2026-01-01T00:00:00.000Z", LATER="2026-02-01T00:00:00.000Z";
const identifier=n=>'"'+n.replaceAll('"','""')+'"';
const stable=value=>JSON.stringify(value,(_key,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function rows(db,table,columns) {
  return db.prepare(`SELECT ${columns.map(identifier).join(",")} FROM ${identifier(table)}`).all().map(r=>JSON.parse(JSON.stringify(r))).sort((a,b)=>stable(a).localeCompare(stable(b)));
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
    if(/AUTOINCREMENT/i.test(table.sql)) {
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

// Private verifier module: /__private__/server-retention/server-retention-core-cases-draft-v1.cjs
modules["/__private__/server-retention/server-retention-core-cases-draft-v1.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
const {NOW,DAY}=require('./server-retention-core-fixture-draft-v1.cjs');
const item=(operation,settings={})=>({operation,settings});
function semanticBatches(){
  const batches=Array.from({length:7},()=>[]);
  for(const empty of [false,true])for(const dryRun of [false,true])for(const asyncTx of [false,true])
    for(const repeat of [false,true])batches[0].push(item('run',{empty,dryRun,asyncTx,repeat}));
  for(const date of ['2027-01-01','2027-02-01','2027-03-01','2027-04-01','2028-02-29','2027-03-31'])
    for(const offset of [-1,0,1])for(const dryRun of [false,true])
      batches[1].push(item('run',{now:Date.parse(date+'T00:00:00.000Z')+offset,dryRun}));
  for(const lastActivityAt of ['2026-02-01T00:00:00.000Z','2027-04-01T00:00:00.000Z'])
    for(const stoppedAt of [null,'2026-01-01T00:00:00.000Z','2027-04-01T00:00:00.000Z'])
      batches[1].push(item('run',{lastActivityAt,stoppedAt}));
  for(const restoreDays of [7,30,37])for(const deletedAgeDays of [7,29,30,31,37,38])
    for(const deletedOffset of [-1,0,1])for(const dryRun of [false,true])
      batches[2].push(item('run',{restoreDays,deletedAgeDays,deletedOffset,dryRun}));
  for(const departureAgeDays of [29,30,31])for(const departureOffset of [-1,0,1])
    for(const removeMembership of [false,true])for(const dryRun of [false,true])
      batches[3].push(item('run',{departureAgeDays,departureOffset,removeMembership,plantPerson:true,dryRun}));
  for(const noPending of [false,true])for(const outerTx of [false,true])
    batches[3].push(item('pseudonymise',{noPending,outerTx,plantPerson:true,removeMembership:true}));
  for(const operation of ['naming','departure','cancel'])for(const noPending of [false,true])
    for(const user of ['fixture-viewer-a','fixture-owner-a','missing'])
      batches[3].push(item(operation,{noPending,user}));
  for(const missingVerification of [false,true])for(const missingSessions of [false,true])
    for(const missingMarkers of [false,true])for(const sessionCapDays of [7,30,365])
      batches[4].push(item('run',{missingVerification,missingSessions,missingMarkers,sessionCapDays,lastActivityAt:new Date(NOW).toISOString()}));
  for(const ALIGN_TEST_IDP of [undefined,'0','1'])for(const ALIGN_TEST_NOW of [undefined,'','invalid','2020-02-29T12:00:00.000Z'])
    for(const idpEnabled of [false,true])for(const explicitEnv of [false,true])
      batches[5].push(item('clock',{env:{ALIGN_TEST_IDP,ALIGN_TEST_NOW},idpEnabled,explicitEnv}));
  for(const personId of ['fm_0','fm_1','fm_0003','fm_-1','fm_12x','xfm_2','unknown'])
    for(const personName of [undefined,null,'','Name'])batches[6].push(item('name',{personId,personName,empty:true}));
  for(const n of [-1,0,1,18,1000000])batches[6].push(item('former-id',{n,empty:true}));
  for(const reverseCounts of [false,true])batches[6].push(item('describe',{reverseCounts,empty:true}));
  for(const dryRun of [false,true])batches[6].push(item('run',{dryRun,fileBacked:true,plantPerson:true,removeMembership:true}));
  batches[6].push(item('orphans'));
  return batches;
}
const faultPaths=[item('run'),item('run',{dryRun:true}),item('run',{plantPerson:true,removeMembership:true,lastActivityAt:new Date(NOW).toISOString()}),
  item('pseudonymise',{plantPerson:true,removeMembership:true,outerTx:true}),item('naming',{plantPerson:true}),
  item('clock',{env:{ALIGN_TEST_IDP:'1',ALIGN_TEST_NOW:'2020-02-29T12:00:00.000Z'}}),item('describe',{empty:true})];
module.exports={semanticBatches,faultPaths};

};

// Private verifier module: /__private__/server-retention/server-retention-core-fixture-draft-v1.cjs
modules["/__private__/server-retention/server-retention-core-fixture-draft-v1.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Labeled synthetic private records in the measured 48-table storage schema.
// Authentication tables here are explicit external fixtures, not auth qualification.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const data=require('./retention-private-data-v1.json');
const storage=require('./retention-private-storage-seed-v1.cjs')(data.inventory);
const resourceNames=['eventActor','purgeWorkspace','RESTORE_DAYS','sessionMaxDays','testIdpEnabled','readDate','readProcessEnv'];
const metadata={retentionNow:0,formerMemberId:1,personName:2,workspacesNaming:2,noteDeparture:4,cancelDeparture:3,pseudonymise:5,deleteOrphanDirectives:1,runRetention:4,describeCounts:1};
const exportsInOrder=['RESTORE_DAYS','FORMER_MEMBER_DAYS','SESSION_MONTHS','AUDIT_MONTHS','INVITE_GRACE_DAYS','ACCESS_REQUEST_MONTHS','EVENT_MONTHS','CLOSED_ASK_MONTHS','VALUE_REPORT_MONTHS','REQUEST_MONTHS','DELETED_SESSION_MONTHS','RETENTION_INTERVAL_MS','retentionNow','formerMemberId','personName','PERSON_COLUMNS','workspacesNaming','noteDeparture','cancelDeparture','pseudonymise','deleteOrphanDirectives','runRetention','describeCounts'];
const DAY=86400000,NOW=Date.parse('2027-04-01T00:00:00.000Z');
const id=name=>'"'+name.replaceAll('"','""')+'"';
function normalize(value,seen=new Map()){
  if(value===undefined)return {$undefined:true};
  if(typeof value==='function')return {$function:true};
  if(typeof value==='symbol')return {$symbol:String(value)};
  if(typeof value==='bigint')return {$bigint:String(value)};
  if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
  if(value===null||typeof value!=='object')return value;
  if(value instanceof Date)return {$date:Number.isNaN(value.getTime())?'Invalid Date':value.toISOString()};
  if(seen.has(value))return {$ref:seen.get(value)};
  seen.set(value,seen.size);
  if(Array.isArray(value))return Array.from(value,x=>normalize(x,seen));
  return Object.fromEntries(Object.keys(value).map(key=>[key,normalize(value[key],seen)]));
}
function fixture(settings={}){
  const temporary=settings.fileBacked?fs.mkdtempSync(path.join(os.tmpdir(),'align-retention-test-')):null;
  const filename=temporary?path.join(temporary,'private.sqlite'):':memory:';
  const db=new DatabaseSync(filename,{enableForeignKeyConstraints:true});
  db.exec('CREATE TABLE ba_user(id TEXT PRIMARY KEY,email TEXT,name TEXT); CREATE TABLE ba_passkey(id TEXT PRIMARY KEY); CREATE TABLE ba_verification(id TEXT PRIMARY KEY,expiresAt TEXT); CREATE TABLE ba_session(id TEXT PRIMARY KEY,expiresAt TEXT,createdAt TEXT);');
  const tables=data.inventory.snapshots['22'].tables;
  for(const table of tables)db.exec(table.sql);
  for(const table of tables){for(const index of table.indexes)if(index.sql)db.exec(index.sql);for(const trigger of table.triggers)db.exec(trigger.sql);}
  db.exec('PRAGMA user_version=22');
  if(!settings.empty)storage.seed(db,22);
  const nowMs=settings.now??NOW,nowIso=new Date(nowMs).toISOString(),secret='fixture-retention-actor-key';
  const actor=user=> 'ale.'+crypto.createHmac('sha256',secret).update(user).digest('base64url');
  const user=settings.user??'fixture-viewer-a',ws=settings.ws??'fixture-ws-a';
  const at=ms=>new Date(ms).toISOString();
  function insert(table,row){const keys=Object.keys(row);return db.prepare('INSERT INTO '+id(table)+' ('+keys.map(id).join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));}
  if(!settings.empty){
    db.prepare('UPDATE ba_user SET email=id||?,name=id||?').run('@fixture.invalid',' private name');
    if(settings.noPending)db.prepare('DELETE FROM v2_former_members WHERE ws_id=? AND user_id=?').run(ws,user);
    if(settings.departureAgeDays!==undefined)db.prepare('UPDATE v2_former_members SET removed_at=? WHERE ws_id=? AND user_id=?').run(at(nowMs-settings.departureAgeDays*DAY+(settings.departureOffset??0)),ws,user);
    if(settings.removeMembership)db.prepare('DELETE FROM v2_members WHERE ws_id=? AND user_id=?').run(ws,user);
    if(settings.plantPerson){
      for(const [table,column]of data.personColumns)db.prepare('UPDATE '+id(table)+' SET '+id(column)+'=? WHERE ws_id=?').run(user,ws);
      db.prepare('UPDATE v2_workspaces SET created_by=? WHERE id=?').run(user,ws);
      db.prepare('UPDATE v2_alignment_revisions SET approvers_json=? WHERE ws_id=?').run(JSON.stringify({sets:[[user]],approved_by:[user],via:'sessions:'+user}),ws);
      db.prepare("UPDATE v2_directives SET goal_json=? WHERE ws_id=? AND kind='goal_version'").run(JSON.stringify({owner:{id:user,name:'private person'}}),ws);
      db.prepare("UPDATE v2_directives SET hold_json=? WHERE ws_id=? AND kind='hold'").run(JSON.stringify({by:user,reason:'private reason'}),ws);
      db.prepare('UPDATE v2_invites SET email=? WHERE ws_id=?').run(user+'@fixture.invalid',ws);
      insert('v2_events',{name:'device_paired',ws_id:ws,actor:actor(user),at:nowIso,props:'{}'});
      insert('v2_events',{name:'device_paired',ws_id:'fixture-ws-b',actor:actor(user),at:nowIso,props:'{}'});
    }
    if(settings.deletedAgeDays!==undefined)db.prepare('UPDATE v2_workspaces SET deleted_at=? WHERE id=?').run(at(nowMs-settings.deletedAgeDays*DAY+(settings.deletedOffset??0)),ws);
    if(settings.stoppedAt!==undefined)db.prepare('UPDATE v2_sessions SET stopped_at=? WHERE ws_id=?').run(settings.stoppedAt,ws);
    if(settings.lastActivityAt!==undefined){
      db.prepare('UPDATE v2_sessions SET updated_at=? WHERE ws_id=?').run(settings.lastActivityAt,ws);
      db.prepare('UPDATE v2_usage SET received_at=? WHERE ws_id=?').run(settings.lastActivityAt,ws);
      db.prepare('UPDATE v2_epochs SET created_at=? WHERE ws_id=?').run(settings.lastActivityAt,ws);
    }
    for(const state of ['open','accepted','done','declined','withdrawn']){
      const ask=db.prepare('SELECT * FROM v2_asks WHERE ws_id=? LIMIT 1').get(ws);
      if(ask){const clone={...ask,id:'retention-ask-'+state,state,updated_at:settings.contentAt??ask.updated_at};insert('v2_asks',clone);}
    }
    if(settings.contentAt!==undefined){
      db.prepare('UPDATE v2_events SET actor=actor WHERE ws_id=?').run(ws);
      db.prepare('UPDATE v2_value_reports SET updated_at=? WHERE ws_id=?').run(settings.contentAt,ws);
      db.prepare('UPDATE v2_asks SET updated_at=? WHERE ws_id=?').run(settings.contentAt,ws);
    }
  }
  if(!settings.missingVerification){
    for(const [key,offset]of [['expired',-1],['boundary',0],['future',1]])insert('ba_verification',{id:key,expiresAt:at(nowMs+offset)});
  }else db.exec('DROP TABLE ba_verification');
  if(!settings.missingSessions){
    const cap=(settings.sessionCapDays??30)*DAY;
    for(const [key,expiresAt,createdAt]of [['expired',nowMs-1,nowMs-DAY],['cap-past',nowMs+DAY,nowMs-cap-1],['cap-boundary',nowMs+DAY,nowMs-cap],['valid',nowMs+DAY,nowMs-1]])insert('ba_session',{id:key,expiresAt:at(expiresAt),createdAt:at(createdAt)});
  }else db.exec('DROP TABLE ba_session');
  if(settings.missingMarkers)db.exec('DROP TABLE v2_deleted_sessions');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'Private fixture must start with valid foreign keys');
  const tableNames=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const snapshot=()=>{
    const rows=Object.fromEntries(tableNames.map(table=>[table,db.prepare('SELECT * FROM '+id(table)).all().map(row=>({...row})).sort((a,b)=>storage.stable(a).localeCompare(storage.stable(b)))]));
    rows.sqlite_sequence=db.prepare('SELECT * FROM sqlite_sequence ORDER BY name').all();return rows;
  };
  const initial=normalize(snapshot()),initialFile=temporary?crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'):null;
  let active=false,reads=0,effects=0,captures=0,transactions=0,purges=0;
  const trace=[],wrapped=new WeakMap(),known=new WeakSet(),fault=new Error('owned retention core fault');
  const quiet=fn=>{const old=active;active=false;try{return fn();}finally{active=old;}};
  function watch(value,label){
    if(!value||typeof value!=='object'||value instanceof Date)return value;
    if(known.has(value))return value;if(wrapped.has(value))return wrapped.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver){if(active&&typeof key==='string'){trace.push(['get',label,key]);if(++reads===settings.propertyFault)throw fault;}return watch(Reflect.get(target,key,receiver),label+'.'+String(key));},
      ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);},
    });wrapped.set(value,proxy);known.add(proxy);return proxy;
  }
  function effect(name,args,fn){if(active){trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;}return quiet(fn);}
  const sqlPort={};
  for(const method of ['get','all','run'])sqlPort[method]=function(sql,...args){
    assert.equal(this,sqlPort);
    return effect('db.'+method,[sql,...args],()=>{const value=db.prepare(sql)[method](...args);return method==='run'?Number(value.changes):watch(value,method+'.'+sql);});
  };
  const tx=function(callback){
    assert.equal(this,undefined);
    const callbackActive=active;
    return effect('tx',[],()=>{
      transactions++;trace.push(['tx.begin',transactions]);db.exec('BEGIN IMMEDIATE');
      const invoke=()=>{const previous=active;active=callbackActive;try{return callback();}finally{active=previous;}};
      try{const value=invoke();assert.notEqual(Object.prototype.toString.call(value),'[object Promise]');db.exec('COMMIT');trace.push(['tx.commit',normalize(value)]);return settings.asyncTx?Promise.resolve(value):value;}
      catch(error){db.exec('ROLLBACK');trace.push(['tx.rollback',normalize(error),error===fault]);if(settings.asyncTx)return Promise.reject(error);throw error;}
    });
  };
  const processEnv=watch({...settings.env},'processEnv');
  class FixedDate extends Date{constructor(...args){super(...(args.length?args:[settings.clock??nowMs]));}static now(){return settings.clock??nowMs;}}
  const supplied={
    eventActor:function(key,who){assert.equal(this,undefined);return effect('eventActor',[key,who],()=> 'ale.'+crypto.createHmac('sha256',key).update(who).digest('base64url'));},
    purgeWorkspace:function(dbArg,workspace){
      assert.equal(this,undefined);assert.equal(dbArg,sqlPort);
      return effect('purgeWorkspace',[workspace],()=>{
        purges++;
        db.prepare('UPDATE v2_events SET ws_id=? WHERE ws_id=?').run('wsx-private-'+purges,workspace);
        db.prepare('UPDATE v2_creation_codes SET ws_id=NULL WHERE ws_id=?').run(workspace);
        db.prepare('DELETE FROM v2_workspaces WHERE id=?').run(workspace);
      });
    },
    RESTORE_DAYS:settings.restoreDays??30,
    sessionMaxDays:function(env){assert.equal(this,undefined);return effect('sessionMaxDays',[env],()=>settings.sessionCapDays??30);},
    testIdpEnabled:function(env){assert.equal(this,undefined);return effect('testIdpEnabled',[env],()=>Object.hasOwn(settings,'idpEnabled')?settings.idpEnabled:env.ALIGN_TEST_IDP==='1');},
    readDate:function(){assert.equal(this,undefined);return effect('readDate',[],()=>FixedDate);},
    readProcessEnv:function(){assert.equal(this,undefined);return effect('readProcessEnv',[],()=>processEnv);},
  };
  const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw Error('Resource enumeration forbidden');}});
  async function run(factory,operation='run'){
    let value,caught,didThrow=false,returnedPromise,outerStarted=false;
    try{
      const api=factory(resources);assert.deepEqual(Object.keys(api),exportsInOrder);
      for(const [name,length]of Object.entries(metadata)){
        assert.equal(api[name].name,name);assert.equal(api[name].length,length);assert.equal(api[name].constructor.name,name==='runRetention'?'AsyncFunction':'Function');
      }
      for(const [key,value]of Object.entries(data.constants))assert.deepEqual(normalize(api[key]),key==='RESTORE_DAYS'?(settings.restoreDays??30):value);
      assert(!Object.isFrozen(api.PERSON_COLUMNS));assert.equal(api.PERSON_COLUMNS,api.PERSON_COLUMNS);
      active=true;
      if(settings.outerTx){db.exec('BEGIN IMMEDIATE');outerStarted=true;trace.push(['harness.outer.begin']);}
      if(operation==='run'){
        const options=watch({dryRun:settings.dryRun??false,...(settings.explicitEnv?{env:processEnv}:{}),secret},'options');
        const result=api.runRetention(sqlPort,tx,new Date(nowMs),options);
        returnedPromise=Object.prototype.toString.call(result)==='[object Promise]';assert(returnedPromise);value=await result;
        if(settings.repeat)value={first:value,second:await api.runRetention(sqlPort,tx,new Date(nowMs),options)};
      }else if(operation==='clock')value=settings.explicitEnv?api.retentionNow(processEnv):api.retentionNow();
      else if(operation==='name')value=api.personName(settings.personId??user,Object.hasOwn(settings,'personName')?settings.personName:null);
      else if(operation==='former-id')value=api.formerMemberId(settings.n??1);
      else if(operation==='naming')value=api.workspacesNaming(sqlPort,user);
      else if(operation==='departure'){
        const first=api.noteDeparture(sqlPort,ws,user,nowIso);const second=api.noteDeparture(sqlPort,ws,user,at(nowMs+DAY));value=[first,second];
      }else if(operation==='cancel')value=api.cancelDeparture(sqlPort,ws,user);
      else if(operation==='pseudonymise')value=api.pseudonymise(sqlPort,ws,user,nowIso,secret);
      else if(operation==='orphans')value=api.deleteOrphanDirectives(sqlPort);
      else if(operation==='describe'){
        const entries=['workspaces_purged','sessions_rolled_up','usage_rows_rolled_up','former_members_pseudonymised','audit_rows_deleted','codes_deleted','sign_in_sessions_deleted','activity_deleted','invites_deleted','access_requests_deleted','events_deleted','asks_deleted','value_reports_deleted','requests_deleted','deleted_session_markers_deleted'];
        if(settings.reverseCounts)entries.reverse();value=api.describeCounts(watch(Object.fromEntries(entries.map((key,i)=>[key,i])),'counts'));
      }else throw Error('Unknown retention operation');
      if(outerStarted){db.exec('COMMIT');outerStarted=false;trace.push(['harness.outer.commit']);}
    }catch(error){caught=error;didThrow=true;if(outerStarted){db.exec('ROLLBACK');outerStarted=false;trace.push(['harness.outer.rollback']);}}
    active=false;
    const final=normalize(snapshot()),finalFile=temporary?crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'):null;
    const output={result:normalize(value),error:didThrow?{name:caught?.name,message:caught?.message,code:normalize(caught?.code),sameFault:caught===fault}:null,
      returnedPromise:normalize(returnedPromise),trace,reads,effects,captures,transactions,purges,initial,final,
      foreignKeyViolations:db.prepare('PRAGMA foreign_key_check').all(),fileBytesUnchanged:temporary?initialFile===finalFile:null};
    db.close();if(temporary)fs.rmSync(temporary,{recursive:true});return output;
  }
  return {run};
}
module.exports={fixture,normalize,resourceNames,metadata,exportsInOrder,NOW,DAY};

};

// Private verifier module: /__private__/server-retention/server-retention-runner-fixture-draft-v2.cjs
modules["/__private__/server-retention/server-retention-runner-fixture-draft-v2.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Labeled synthetic scheduler controls. No real timers or application database.
const assert=require('node:assert/strict');
const countKeys=['workspaces_purged','sessions_rolled_up','usage_rows_rolled_up','former_members_pseudonymised','audit_rows_deleted','codes_deleted','sign_in_sessions_deleted','activity_deleted','invites_deleted','access_requests_deleted','events_deleted','asks_deleted','value_reports_deleted','requests_deleted','deleted_session_markers_deleted'];
const resourceNames=['core','runRetention','globalState','readConsole','readSetInterval'];
function normalize(value,seen=new Map()){
  if(value===undefined)return {$undefined:true};
  if(typeof value==='function')return {$function:true};
  if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return {$ref:seen.get(value)};
  seen.set(value,seen.size);
  if(Array.isArray(value))return Array.from(value,x=>normalize(x,seen));
  return Object.fromEntries(Object.keys(value).map(key=>[key,normalize(value[key],seen)]));
}
function fixture(settings={}){
  let active=false,reads=0,effects=0,captures=0,runCalls=0,unrefs=0,lastNow;
  const trace=[],callbacks=[],pending=[],wrapped=new WeakMap(),fault=new Error('owned retention runner fault');
  const sourceError=Object.hasOwn(settings,'errorValue')?settings.errorValue:Object.assign(new Error('private retention error text'),{name:settings.errorName??'OwnedRetentionError'});
  const counts=Object.fromEntries(countKeys.map(key=>[key,key===settings.positiveKey?(settings.count??1):0]));
  const proxies=new WeakSet();
  const state={};
  if(settings.existingTimer)state.__alignRetention={id:'existing-timer'};
  const quiet=fn=>{const old=active;active=false;try{return fn();}finally{active=old;}};
  function watch(value,label){
    if(!value||typeof value!=='object'||value instanceof Date)return value;
    if(proxies.has(value))return value;
    if(wrapped.has(value))return wrapped.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver){if(active&&typeof key==='string'){trace.push(['get',label,key]);if(++reads===settings.propertyFault)throw fault;}return watch(Reflect.get(target,key,receiver),label+'.'+String(key));},
      set(target,key,value,receiver){if(active)trace.push(['set',label,String(key),quiet(()=>normalize(value))]);return Reflect.set(target,key,value,receiver);},
      ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);},
    });
    wrapped.set(value,proxy);proxies.add(proxy);return proxy;
  }
  function effect(name,args,fn){
    if(active){trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;}
    return quiet(fn);
  }
  let core;
  core=watch({
    retentionNow:function(){assert.equal(this,core);return effect('retentionNow',[],()=>lastNow=new Date('2026-11-09T00:00:00.000Z'));},
    describeCounts:function(c){assert.equal(this,core);return effect('describeCounts',[c],()=>Object.entries(c).map(([key,value])=>key.replaceAll('_',' ')+' '+value).join(', '));},
    RETENTION_INTERVAL_MS:86400000,
  },'core');
  const consolePort={
    log:function(...args){assert.equal(this,consolePort);return effect('console.log',args,()=>undefined);},
    error:function(...args){assert.equal(this,consolePort);return effect('console.error',args,()=>{trace.push(['error-identity',args[1]===sourceError,args[1]===fault]);});},
  };
  const statePort=watch(state,'globalState');
  const timerFactory=function(callback,interval){
    assert.equal(this,undefined);assert.equal(typeof callback,'function');
    return effect('setInterval',[interval],()=>{
      const target={id:'timer-'+(callbacks.length+1)};let timer;
      if(!settings.unrefMissing)target.unref=function(){assert.equal(this,timer);return effect('unref',[],()=>{unrefs++;});};
      timer=watch(target,'timer-'+(callbacks.length+1));callbacks.push(callback);return timer;
    });
  };
  const supplied={
    core,globalState:statePort,
    runRetention:function(now){
      assert.equal(this,undefined);assert.equal(now,lastNow);
      return effect('runRetention',[now.toISOString()],()=>{
        runCalls++;
        const reject=settings.rejectRun===true || (Array.isArray(settings.rejectRun)&&settings.rejectRun.includes(runCalls));
        if(settings.deferred)return new Promise((resolve,rejectPromise)=>pending.push(()=>reject?rejectPromise(sourceError):resolve(watch({...counts},'counts-'+runCalls))));
        return reject?Promise.reject(sourceError):Promise.resolve(watch({...counts},'counts-'+runCalls));
      });
    },
    readConsole:function(){assert.equal(this,undefined);return effect('readConsole',[],()=>consolePort);},
    readSetInterval:function(){assert.equal(this,undefined);return effect('readSetInterval',[],()=>timerFactory);},
  };
  const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw Error('Resource enumeration forbidden');}});
  const flush=()=>{while(pending.length)pending.shift()();};
  async function run(factory){
    let value,caught,didThrow=false;
    try{
      const api=factory(resources);
      assert.deepEqual(Object.keys(api),['startRetention']);
      assert.equal(api.startRetention.name,'startRetention');assert.equal(api.startRetention.length,1);assert.equal(api.startRetention.constructor.name,'AsyncFunction');
      active=true;
      if(settings.concurrent){
        const tasks=Array.from({length:settings.calls??2},()=>api.startRetention(settings.hosted??false));
        trace.push(['after-start-calls',callbacks.length,pending.length]);flush();value=await Promise.all(tasks);
      }else{
        value=[];
        for(let i=0;i<(settings.calls??1);i++){
          const task=api.startRetention(settings.hosted??false);
          trace.push(['after-start-call',callbacks.length,pending.length]);flush();value.push(await task);
        }
      }
      if(settings.fireTimer&&callbacks.length){
        assert(!settings.propertyFault&&!settings.effectFault,'Fault controls use awaited startup, not detached timer promises');
        callbacks[0]();trace.push(['after-timer-call',pending.length]);flush();
        await Promise.resolve();await Promise.resolve();await Promise.resolve();
      }
    }catch(error){caught=error;didThrow=true;flush();}
    active=false;
    return {result:normalize(value),error:didThrow?{name:caught?.name,message:caught?.message,sameFault:caught===fault,sameSourceError:caught===sourceError}:null,
      trace,reads,effects,captures,runCalls,timers:callbacks.length,unrefs,state:normalize(state)};
  }
  return {run};
}
function semanticCases(){
  const rows=[];
  for(const hosted of [false,true])for(const existingTimer of [false,true])for(const deferred of [false,true])
    for(const positiveKey of [undefined,...countKeys])
      rows.push({hosted,existingTimer,deferred,positiveKey});
  for(const hosted of [false,true])for(const concurrent of [false,true])for(const calls of [1,2,3])
    for(const deferred of [false,true])for(const unrefMissing of [false,true])
      rows.push({hosted,concurrent,calls,deferred,unrefMissing,positiveKey:'events_deleted'});
  for(const hosted of [false,true])for(const errorValue of [undefined,null,false,0,'private rejection',{name:'OwnedName',message:'private detail'}])
    for(const existingTimer of [false,true]){
      const row={hosted,rejectRun:true,existingTimer};
      if(errorValue!==undefined)row.errorValue=errorValue;
      rows.push(row);
    }
  for(const hosted of [false,true])for(const deferred of [false,true])for(const rejectRun of [false,true,[2]])
    rows.push({hosted,deferred,rejectRun,fireTimer:true,positiveKey:'events_deleted'});
  for(const count of [-1,0,1,2])rows.push({positiveKey:'events_deleted',count,calls:2});
  return rows;
}
const faultPaths=[{}, {positiveKey:'events_deleted'}, {hosted:true,rejectRun:true},
  {hosted:false,rejectRun:true}, {existingTimer:true,positiveKey:'workspaces_purged'},
  {deferred:true,calls:2,positiveKey:'events_deleted'}, {concurrent:true,deferred:true,calls:2}];
module.exports={fixture,normalize,resourceNames,countKeys,semanticCases,faultPaths};

};

// Private verifier module: /__private__/server-retention/server-retention-runner-fixture-draft-v4.cjs
modules["/__private__/server-retention/server-retention-runner-fixture-draft-v4.cjs"] = function(require,module,exports,__filename,__dirname) {
'use strict';
// Labeled synthetic scheduler controls. No real timers or application database.
// The VM observer tracks declared count fields, excluding absent Promise-internal then probes.
// The untouched native-host observer v2 and all 422 observations remain separate required acceptance.
const assert=require('node:assert/strict');
const countKeys=['workspaces_purged','sessions_rolled_up','usage_rows_rolled_up','former_members_pseudonymised','audit_rows_deleted','codes_deleted','sign_in_sessions_deleted','activity_deleted','invites_deleted','access_requests_deleted','events_deleted','asks_deleted','value_reports_deleted','requests_deleted','deleted_session_markers_deleted'];
const resourceNames=['core','runRetention','globalState','readConsole','readSetInterval'];
function normalize(value,seen=new Map()){
  if(value===undefined)return {$undefined:true};
  if(typeof value==='function')return {$function:true};
  if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return {$ref:seen.get(value)};
  seen.set(value,seen.size);
  if(Array.isArray(value))return Array.from(value,x=>normalize(x,seen));
  return Object.fromEntries(Object.keys(value).map(key=>[key,normalize(value[key],seen)]));
}
function fixture(settings={}){
  let active=false,reads=0,effects=0,captures=0,runCalls=0,unrefs=0,lastNow;
  const trace=[],callbacks=[],pending=[],wrapped=new WeakMap(),fault=new Error('owned retention runner fault');
  const sourceError=Object.hasOwn(settings,'errorValue')?settings.errorValue:Object.assign(new Error('private retention error text'),{name:settings.errorName??'OwnedRetentionError'});
  const counts=Object.fromEntries(countKeys.map(key=>[key,key===settings.positiveKey?(settings.count??1):0]));
  const proxies=new WeakSet();
  const state={};
  if(settings.existingTimer)state.__alignRetention={id:'existing-timer'};
  const quiet=fn=>{const old=active;active=false;try{return fn();}finally{active=old;}};
  function watch(value,label){
    if(!value||typeof value!=='object'||value instanceof Date)return value;
    if(proxies.has(value))return value;
    if(wrapped.has(value))return wrapped.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver){if(active&&typeof key==='string'&&!(label.startsWith('counts-')&&key==='then'&&!Object.hasOwn(target,key))){trace.push(['get',label,key]);if(++reads===settings.propertyFault)throw fault;}return watch(Reflect.get(target,key,receiver),label+'.'+String(key));},
      set(target,key,value,receiver){if(active)trace.push(['set',label,String(key),quiet(()=>normalize(value))]);return Reflect.set(target,key,value,receiver);},
      ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);},
    });
    wrapped.set(value,proxy);proxies.add(proxy);return proxy;
  }
  function effect(name,args,fn){
    if(active){trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;}
    return quiet(fn);
  }
  let core;
  core=watch({
    retentionNow:function(){assert.equal(this,core);return effect('retentionNow',[],()=>lastNow=new Date('2026-11-09T00:00:00.000Z'));},
    describeCounts:function(c){assert.equal(this,core);return effect('describeCounts',[c],()=>Object.entries(c).map(([key,value])=>key.replaceAll('_',' ')+' '+value).join(', '));},
    RETENTION_INTERVAL_MS:86400000,
  },'core');
  const consolePort={
    log:function(...args){assert.equal(this,consolePort);return effect('console.log',args,()=>undefined);},
    error:function(...args){assert.equal(this,consolePort);return effect('console.error',args,()=>{trace.push(['error-identity',args[1]===sourceError,args[1]===fault]);});},
  };
  const statePort=watch(state,'globalState');
  const timerFactory=function(callback,interval){
    assert.equal(this,undefined);assert.equal(typeof callback,'function');
    return effect('setInterval',[interval],()=>{
      const target={id:'timer-'+(callbacks.length+1)};let timer;
      if(!settings.unrefMissing)target.unref=function(){assert.equal(this,timer);return effect('unref',[],()=>{unrefs++;});};
      timer=watch(target,'timer-'+(callbacks.length+1));callbacks.push(callback);return timer;
    });
  };
  const supplied={
    core,globalState:statePort,
    runRetention:function(now){
      assert.equal(this,undefined);assert.equal(now,lastNow);
      return effect('runRetention',[now.toISOString()],()=>{
        runCalls++;
        const reject=settings.rejectRun===true || (Array.isArray(settings.rejectRun)&&settings.rejectRun.includes(runCalls));
        if(settings.deferred)return new Promise((resolve,rejectPromise)=>pending.push(()=>reject?rejectPromise(sourceError):resolve(watch({...counts},'counts-'+runCalls))));
        return reject?Promise.reject(sourceError):Promise.resolve(watch({...counts},'counts-'+runCalls));
      });
    },
    readConsole:function(){assert.equal(this,undefined);return effect('readConsole',[],()=>consolePort);},
    readSetInterval:function(){assert.equal(this,undefined);return effect('readSetInterval',[],()=>timerFactory);},
  };
  const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw Error('Resource enumeration forbidden');}});
  const flush=()=>{while(pending.length)pending.shift()();};
  async function run(factory){
    let value,caught,didThrow=false;
    try{
      const api=factory(resources);
      assert.deepEqual(Object.keys(api),['startRetention']);
      assert.equal(api.startRetention.name,'startRetention');assert.equal(api.startRetention.length,1);assert.equal(api.startRetention.constructor.name,'AsyncFunction');
      active=true;
      if(settings.concurrent){
        const tasks=Array.from({length:settings.calls??2},()=>api.startRetention(settings.hosted??false));
        trace.push(['after-start-calls',callbacks.length,pending.length]);flush();value=await Promise.all(tasks);
      }else{
        value=[];
        for(let i=0;i<(settings.calls??1);i++){
          const task=api.startRetention(settings.hosted??false);
          trace.push(['after-start-call',callbacks.length,pending.length]);flush();value.push(await task);
        }
      }
      if(settings.fireTimer&&callbacks.length){
        assert(!settings.propertyFault&&!settings.effectFault,'Fault controls use awaited startup, not detached timer promises');
        callbacks[0]();trace.push(['after-timer-call',pending.length]);flush();
        await Promise.resolve();await Promise.resolve();await Promise.resolve();
      }
    }catch(error){caught=error;didThrow=true;flush();}
    active=false;
    return {result:normalize(value),error:didThrow?{name:caught?.name,message:caught?.message,sameFault:caught===fault,sameSourceError:caught===sourceError}:null,
      trace,reads,effects,captures,runCalls,timers:callbacks.length,unrefs,state:normalize(state)};
  }
  return {run};
}
function semanticCases(){
  const rows=[];
  for(const hosted of [false,true])for(const existingTimer of [false,true])for(const deferred of [false,true])
    for(const positiveKey of [undefined,...countKeys])
      rows.push({hosted,existingTimer,deferred,positiveKey});
  for(const hosted of [false,true])for(const concurrent of [false,true])for(const calls of [1,2,3])
    for(const deferred of [false,true])for(const unrefMissing of [false,true])
      rows.push({hosted,concurrent,calls,deferred,unrefMissing,positiveKey:'events_deleted'});
  for(const hosted of [false,true])for(const errorValue of [undefined,null,false,0,'private rejection',{name:'OwnedName',message:'private detail'}])
    for(const existingTimer of [false,true]){
      const row={hosted,rejectRun:true,existingTimer};
      if(errorValue!==undefined)row.errorValue=errorValue;
      rows.push(row);
    }
  for(const hosted of [false,true])for(const deferred of [false,true])for(const rejectRun of [false,true,[2]])
    rows.push({hosted,deferred,rejectRun,fireTimer:true,positiveKey:'events_deleted'});
  for(const count of [-1,0,1,2])rows.push({positiveKey:'events_deleted',count,calls:2});
  return rows;
}
const faultPaths=[{}, {positiveKey:'events_deleted'}, {hosted:true,rejectRun:true},
  {hosted:false,rejectRun:true}, {existingTimer:true,positiveKey:'workspaces_purged'},
  {deferred:true,calls:2,positiveKey:'events_deleted'}, {concurrent:true,deferred:true,calls:2}];
module.exports={fixture,normalize,resourceNames,countKeys,semanticCases,faultPaths};

};

// Private JSON data, rendered as literal objects for inspection.
const jsonData = {
  "/__private__/server-retention/core-characterization.json": {
    "batches": [
      {
        "batch": 0,
        "records": 16,
        "sha256": "e82b80fb371cfc5164881cc35dbd2d436dc4b8341a42923c087543c04f1f1309"
      },
      {
        "batch": 1,
        "records": 42,
        "sha256": "6e93a707e3515bad6bad932be523525188d33fd5f7df7904a4377bfb0d71f2fd"
      },
      {
        "batch": 2,
        "records": 108,
        "sha256": "b7f1194aef5e1ad7dec468741a459163113700ab5540e98334a24979cb2fbff4"
      },
      {
        "batch": 3,
        "records": 58,
        "sha256": "fbef32148c571ee8fd291ce79c6df63d1be0c15cbe8f666fce21451245fb9035"
      },
      {
        "batch": 4,
        "records": 24,
        "sha256": "d6eb615de21ff1c6ca15bbe052d6c53927f9f8556b083b0097f2143fd1302044"
      },
      {
        "batch": 5,
        "records": 48,
        "sha256": "3dc267976810394121bd7a223235de7b423dcfae65f73ec8f82d58de69ff028e"
      },
      {
        "batch": 6,
        "records": 38,
        "sha256": "550c21d94c5424f3a915e1a66d1d288ca53a526263f3e4fd7d2a8ce8fa898d3f"
      },
      {
        "batch": 7,
        "records": 137,
        "sha256": "6d5c6ebd1d012f2f8581a30eced2bc49b9da31dc05910f30994a02df69b63368"
      },
      {
        "batch": 8,
        "records": 256,
        "sha256": "f9e67db5a0ed67ce2100e7fc3ac6d4182a66c8148288f020c3b83d0de17a69d0"
      }
    ],
    "fault_paths": [
      {
        "operation": "run",
        "settings": {},
        "reads": 38,
        "effects": 58,
        "captures": 7
      },
      {
        "operation": "run",
        "settings": {
          "dryRun": true
        },
        "reads": 38,
        "effects": 48,
        "captures": 7
      },
      {
        "operation": "run",
        "settings": {
          "plantPerson": true,
          "removeMembership": true,
          "lastActivityAt": "2027-04-01T00:00:00.000Z"
        },
        "reads": 36,
        "effects": 96,
        "captures": 7
      },
      {
        "operation": "pseudonymise",
        "settings": {
          "plantPerson": true,
          "removeMembership": true,
          "outerTx": true
        },
        "reads": 3,
        "effects": 42,
        "captures": 7
      },
      {
        "operation": "naming",
        "settings": {
          "plantPerson": true
        },
        "reads": 5,
        "effects": 1,
        "captures": 7
      },
      {
        "operation": "clock",
        "settings": {
          "env": {
            "ALIGN_TEST_IDP": "1",
            "ALIGN_TEST_NOW": "2020-02-29T12:00:00.000Z"
          }
        },
        "reads": 2,
        "effects": 4,
        "captures": 7
      },
      {
        "operation": "describe",
        "settings": {
          "empty": true
        },
        "reads": 15,
        "effects": 0,
        "captures": 7
      }
    ]
  },
  "/__private__/server-retention/native-runner-characterization.json": {
    "batches": [
      {
        "batch": 0,
        "records": 216,
        "sha256": "d9c028555709d58e57d119c406fe6d9b636fb614cbde809690ec2447bd8fce8f"
      },
      {
        "batch": 1,
        "records": 149,
        "sha256": "c6a7e962b97e72796d1c1fe5dd0d289132f56eed5b46b943580d8e9ae892d459"
      },
      {
        "batch": 2,
        "records": 57,
        "sha256": "2d591648dfd9b541663d178dd849da7bc2be8b045e1770426a81c666b7d7fed3"
      }
    ],
    "fault_paths": [
      {
        "settings": {},
        "reads": 20,
        "effects": 5,
        "captures": 5
      },
      {
        "settings": {
          "positiveKey": "events_deleted"
        },
        "reads": 21,
        "effects": 8,
        "captures": 5
      },
      {
        "settings": {
          "hosted": true,
          "rejectRun": true
        },
        "reads": 5,
        "effects": 7,
        "captures": 5
      },
      {
        "settings": {
          "hosted": false,
          "rejectRun": true
        },
        "reads": 5,
        "effects": 7,
        "captures": 5
      },
      {
        "settings": {
          "existingTimer": true,
          "positiveKey": "workspaces_purged"
        },
        "reads": 18,
        "effects": 5,
        "captures": 5
      },
      {
        "settings": {
          "deferred": true,
          "calls": 2,
          "positiveKey": "events_deleted"
        },
        "reads": 41,
        "effects": 13,
        "captures": 5
      },
      {
        "settings": {
          "concurrent": true,
          "deferred": true,
          "calls": 2
        },
        "reads": 39,
        "effects": 7,
        "captures": 5
      }
    ]
  },
  "/__private__/server-retention/retention-private-data-v1.json": {
    "schema": "align/retention-private-data@1",
    "inventory": {
      "schema": "align/retention-private-storage-schema@1",
      "schema_version": 22,
      "snapshots": {
        "22": {
          "version": 22,
          "table_count": 48,
          "tables": [
            {
              "name": "v2_access_requests",
              "sql": "CREATE TABLE v2_access_requests (\n    id TEXT PRIMARY KEY,\n    email TEXT NOT NULL,\n    name TEXT NOT NULL,\n    company TEXT,\n    team_size TEXT,\n    use_case TEXT NOT NULL,\n    interest TEXT NOT NULL CHECK (interest IN ('try','evaluate')),\n    status TEXT NOT NULL CHECK (status IN ('pending','approved','declined')),\n    created_at TEXT NOT NULL,\n    decided_at TEXT,\n    code_id TEXT\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "email",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "name",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "company",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "team_size",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "use_case",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "interest",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "status",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "decided_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "code_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_access_requests_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_access_requests_email",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_access_requests_email ON v2_access_requests(email)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "email",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_access_requests_status",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_access_requests_status ON v2_access_requests(status, created_at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 7,
                      "name": "status",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 8,
                      "name": "created_at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_activity",
              "sql": "CREATE TABLE v2_activity (\n    seq INTEGER PRIMARY KEY AUTOINCREMENT,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    session_key TEXT NOT NULL,\n    user_id TEXT NOT NULL,\n    goal_id TEXT,\n    repo_id TEXT NOT NULL,\n    kind TEXT NOT NULL CHECK (kind IN ('edit','commit','task','claim')),\n    path_hash TEXT,\n    path TEXT,\n    text TEXT,\n    at TEXT NOT NULL,\n    expires_at TEXT NOT NULL,\n    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "seq",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "repo_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "kind",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "path_hash",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "path",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "text",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "expires_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_sessions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_sessions",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "v2_activity_expiry",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_activity_expiry ON v2_activity(ws_id, expires_at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 11,
                      "name": "expires_at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_activity_ws",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_activity_ws ON v2_activity(ws_id, seq)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "seq",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_alignment_approvals",
              "sql": "CREATE TABLE v2_alignment_approvals (\n    ws_id TEXT NOT NULL,\n    alignment_id TEXT NOT NULL,\n    revision INTEGER NOT NULL,\n    user_id TEXT NOT NULL,\n    at TEXT NOT NULL,\n    PRIMARY KEY (alignment_id, revision, user_id),\n    FOREIGN KEY (ws_id, alignment_id, revision) REFERENCES v2_alignment_revisions(ws_id, alignment_id, revision) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "alignment_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_alignment_revisions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_alignment_revisions",
                  "from": "alignment_id",
                  "to": "alignment_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 2,
                  "table": "v2_alignment_revisions",
                  "from": "revision",
                  "to": "revision",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_alignment_approvals_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "alignment_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_alignment_revisions",
              "sql": "CREATE TABLE v2_alignment_revisions (\n    ws_id TEXT NOT NULL,\n    alignment_id TEXT NOT NULL,\n    revision INTEGER NOT NULL,\n    choice TEXT NOT NULL CHECK (choice IN ('contribution','work_toward')),\n    effects_json TEXT NOT NULL,\n    approvers_json TEXT NOT NULL,\n    note TEXT,\n    author_id TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    PRIMARY KEY (alignment_id, revision),\n    UNIQUE (ws_id, alignment_id, revision),\n    FOREIGN KEY (ws_id, alignment_id) REFERENCES v2_alignments(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "alignment_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "choice",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "effects_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "approvers_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "note",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "author_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_alignments",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_alignments",
                  "from": "alignment_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_alignment_revisions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "alignment_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_alignment_revisions_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "alignment_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 2,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_alignment_sessions",
              "sql": "CREATE TABLE v2_alignment_sessions (\n    ws_id TEXT NOT NULL,\n    alignment_id TEXT NOT NULL,\n    revision INTEGER NOT NULL,\n    session_key TEXT NOT NULL,\n    PRIMARY KEY (alignment_id, revision, session_key),\n    FOREIGN KEY (ws_id, alignment_id, revision) REFERENCES v2_alignment_revisions(ws_id, alignment_id, revision) ON DELETE CASCADE,\n    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "alignment_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_sessions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_sessions",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_alignment_revisions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_alignment_revisions",
                  "from": "alignment_id",
                  "to": "alignment_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 2,
                  "table": "v2_alignment_revisions",
                  "from": "revision",
                  "to": "revision",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_alignment_sessions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "alignment_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_alignment_sessions_key",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_alignment_sessions_key ON v2_alignment_sessions(ws_id, session_key)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 3,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_alignments",
              "sql": "CREATE TABLE \"v2_alignments\" (\n    id TEXT PRIMARY KEY,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    requester_id TEXT NOT NULL,\n    target_goal_id TEXT NOT NULL,\n    source_goal_id TEXT,\n    state TEXT NOT NULL CHECK (state IN ('pending','countered','approved','rejected','withdrawn','revoked')),\n    revision INTEGER NOT NULL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    decided_at TEXT,\n    revoked_at TEXT,\n    revoked_by TEXT,\n    UNIQUE (ws_id, id),\n    FOREIGN KEY (ws_id, target_goal_id) REFERENCES v2_goals(ws_id, id),\n    FOREIGN KEY (ws_id, source_goal_id) REFERENCES v2_goals(ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "requester_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "target_goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "source_goal_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "decided_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "revoked_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "revoked_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "source_goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "target_goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 2,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_alignments_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_alignments_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_ask_mentions",
              "sql": "CREATE TABLE v2_ask_mentions (\n    ws_id TEXT NOT NULL,\n    ask_id TEXT NOT NULL,\n    n INTEGER NOT NULL,                        -- 1..10\n    date TEXT NOT NULL,\n    text TEXT NOT NULL,                        -- 1..300\n    source_title TEXT NOT NULL,                -- 1..120\n    added_by TEXT NOT NULL,\n    added_at TEXT NOT NULL,\n    PRIMARY KEY (ask_id, n),\n    FOREIGN KEY (ws_id, ask_id) REFERENCES v2_asks(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ask_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "n",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "date",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "text",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "source_title",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "added_by",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "added_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_asks",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_asks",
                  "from": "ask_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_ask_mentions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ask_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "n",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_asks",
              "sql": "CREATE TABLE v2_asks (\n    id TEXT PRIMARY KEY,                       -- ask_<24 base32>\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    team_id TEXT NOT NULL,                     -- the team asked (a pod)\n    goal_id TEXT,                              -- optional: the asked team's goal it concerns\n    text TEXT NOT NULL,                        -- 1..400\n    from_label TEXT,                           -- who asked, as people say it (\"Faculty\"), 1..80\n    created_by TEXT NOT NULL,                  -- the person who recorded it\n    source_kind TEXT NOT NULL CHECK (source_kind IN ('meeting','manual')),\n    source_title TEXT,                         -- 1..120, required for meeting\n    source_date TEXT NOT NULL,                 -- YYYY-MM-DD\n    state TEXT NOT NULL CHECK (state IN ('open','accepted','done','declined','withdrawn')),\n    decided_by TEXT,                           -- last person who changed state\n    decided_at TEXT,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    UNIQUE (ws_id, id),\n    FOREIGN KEY (ws_id, team_id) REFERENCES v2_pods(ws_id, id) ON DELETE CASCADE,\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "team_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "text",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "from_label",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "created_by",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "source_kind",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "source_title",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "source_date",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "decided_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "decided_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 14,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_pods",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_pods",
                  "from": "team_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 2,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 3,
                  "name": "sqlite_autoindex_v2_asks_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_asks_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_asks_team",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_asks_team ON v2_asks(ws_id, team_id, state)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "team_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 10,
                      "name": "state",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_asks_ws",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_asks_ws ON v2_asks(ws_id, updated_at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 14,
                      "name": "updated_at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_audit",
              "sql": "CREATE TABLE v2_audit (\n    seq INTEGER PRIMARY KEY AUTOINCREMENT,\n    ws_id TEXT,\n    actor_id TEXT,\n    action TEXT NOT NULL,\n    object_id TEXT,\n    at TEXT NOT NULL\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "seq",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "actor_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "action",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "object_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [],
              "indexes": [
                {
                  "seq": 0,
                  "name": "v2_audit_ws",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_audit_ws ON v2_audit(ws_id, seq)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "seq",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_change_request_evidence",
              "sql": "CREATE TABLE v2_change_request_evidence (\n    id TEXT PRIMARY KEY,\n    ws_id TEXT NOT NULL,\n    change_request_id TEXT NOT NULL,\n    revision INTEGER NOT NULL,\n    kind TEXT NOT NULL CHECK (kind IN ('pr','ci_run','incident','dashboard','doc','other')),\n    url TEXT NOT NULL,\n    label TEXT NOT NULL,\n    source TEXT NOT NULL CHECK (source IN ('person','agent')),\n    added_by TEXT NOT NULL,\n    added_at TEXT NOT NULL,\n    FOREIGN KEY (ws_id, change_request_id) REFERENCES v2_change_requests(ws_id, id) ON DELETE CASCADE,\n    FOREIGN KEY (change_request_id, revision) REFERENCES v2_change_request_revisions(change_request_id, revision) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "change_request_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "kind",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "url",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "label",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "source",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "added_by",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "added_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_change_request_revisions",
                  "from": "change_request_id",
                  "to": "change_request_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_change_request_revisions",
                  "from": "revision",
                  "to": "revision",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_change_requests",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_change_requests",
                  "from": "change_request_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_change_request_evidence_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_change_request_evidence_rev",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_change_request_evidence_rev ON v2_change_request_evidence(change_request_id, revision)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 2,
                      "name": "change_request_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 3,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_change_request_revisions",
              "sql": "CREATE TABLE v2_change_request_revisions (\n    ws_id TEXT NOT NULL,\n    change_request_id TEXT NOT NULL,\n    revision INTEGER NOT NULL,\n    base_version INTEGER NOT NULL,\n    changes_json TEXT NOT NULL,\n    note TEXT,\n    author_id TEXT NOT NULL,\n    created_at TEXT NOT NULL, snapshot_json TEXT, condition TEXT CHECK (condition IS NULL OR length(condition) BETWEEN 1 AND 2000), acknowledged_by TEXT, acknowledged_at TEXT,\n    PRIMARY KEY (change_request_id, revision),\n    FOREIGN KEY (ws_id, change_request_id) REFERENCES v2_change_requests(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "change_request_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "base_version",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "changes_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "note",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "author_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "snapshot_json",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "condition",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "acknowledged_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "acknowledged_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_change_requests",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_change_requests",
                  "from": "change_request_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_change_request_revisions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "change_request_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_change_requests",
              "sql": "CREATE TABLE v2_change_requests (\n    id TEXT PRIMARY KEY,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    goal_id TEXT NOT NULL,\n    requester_id TEXT NOT NULL,\n    state TEXT NOT NULL CHECK (state IN ('pending','countered','approved','rejected','withdrawn','superseded')),\n    revision INTEGER NOT NULL,\n    base_version INTEGER NOT NULL,\n    changes_json TEXT NOT NULL,\n    reason TEXT NOT NULL,\n    approved_by TEXT,\n    rejected_by TEXT,\n    decision_note TEXT,\n    version INTEGER,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    decided_at TEXT, approved_without_evidence INTEGER, launch TEXT CHECK (launch IS NULL OR launch IN ('pending','not_yet','launched','superseded')), approved_json TEXT, launch_by TEXT, launch_at TEXT,\n    UNIQUE (ws_id, id),\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "requester_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "base_version",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "changes_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "reason",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "approved_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "rejected_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "decision_note",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "version",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 14,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 15,
                  "name": "decided_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 16,
                  "name": "approved_without_evidence",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 17,
                  "name": "launch",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 18,
                  "name": "approved_json",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 19,
                  "name": "launch_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 20,
                  "name": "launch_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 3,
                  "name": "sqlite_autoindex_v2_change_requests_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_change_requests_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_change_requests_goal",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_change_requests_goal ON v2_change_requests(ws_id, goal_id)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_change_requests_open",
                  "unique": 1,
                  "origin": "c",
                  "partial": 1,
                  "sql": "CREATE UNIQUE INDEX v2_change_requests_open ON v2_change_requests(goal_id, requester_id) WHERE state IN ('pending','countered')",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 2,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 3,
                      "name": "requester_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_creation_codes",
              "sql": "CREATE TABLE v2_creation_codes (\n    id TEXT PRIMARY KEY,\n    code_hash TEXT NOT NULL UNIQUE,\n    email TEXT,\n    request_id TEXT,\n    created_at TEXT NOT NULL,\n    expires_at TEXT NOT NULL,\n    revoked_at TEXT,\n    redeemed_at TEXT,\n    redeemed_by TEXT,\n    ws_id TEXT\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "code_hash",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "email",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "request_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "expires_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "revoked_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "redeemed_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "redeemed_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_creation_codes_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_creation_codes_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "code_hash",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_creation_codes_email",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_creation_codes_email ON v2_creation_codes(email)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 2,
                      "name": "email",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_deleted_sessions",
              "sql": "CREATE TABLE v2_deleted_sessions (\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    key_hash TEXT NOT NULL,\n    deleted_at TEXT NOT NULL,\n    PRIMARY KEY (ws_id, key_hash)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "key_hash",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "deleted_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_deleted_sessions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "key_hash",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_device_grants",
              "sql": "CREATE TABLE v2_device_grants (\n    device_id TEXT NOT NULL REFERENCES v2_devices(id) ON DELETE CASCADE,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    PRIMARY KEY (device_id, ws_id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "device_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_devices",
                  "from": "device_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_device_grants_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "device_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_device_requests",
              "sql": "CREATE TABLE v2_device_requests (\n    id TEXT PRIMARY KEY,\n    device_code_hash TEXT NOT NULL UNIQUE,\n    user_code TEXT NOT NULL UNIQUE,\n    device_name TEXT NOT NULL,\n    public_key TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    expires_at TEXT NOT NULL,\n    interval_s INTEGER NOT NULL,\n    last_poll_at TEXT,\n    state TEXT NOT NULL CHECK (state IN ('pending','approved','denied','consumed')),\n    user_id TEXT REFERENCES ba_user(id) ON DELETE CASCADE,\n    ws_ids_json TEXT,\n    device_id TEXT\n  , approved_name TEXT)",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "device_code_hash",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "user_code",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "device_name",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "public_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "expires_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "interval_s",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "last_poll_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "ws_ids_json",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "device_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "approved_name",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "ba_user",
                  "from": "user_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_device_requests_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_device_requests_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "device_code_hash",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_device_requests_3",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 2,
                      "name": "user_code",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_device_tokens",
              "sql": "CREATE TABLE v2_device_tokens (\n    token_hash TEXT PRIMARY KEY,\n    device_id TEXT NOT NULL REFERENCES v2_devices(id) ON DELETE CASCADE,\n    kind TEXT NOT NULL CHECK (kind IN ('access','refresh')),\n    created_at TEXT NOT NULL,\n    expires_at TEXT NOT NULL,\n    rotated_at TEXT\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "token_hash",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "device_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "kind",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "expires_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "rotated_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_devices",
                  "from": "device_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_device_tokens_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "token_hash",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_device_tokens_device",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_device_tokens_device ON v2_device_tokens(device_id)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "device_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_devices",
              "sql": "CREATE TABLE v2_devices (\n    id TEXT PRIMARY KEY,\n    user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,\n    name TEXT NOT NULL,\n    public_key TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    last_seen_at TEXT,\n    revoked_at TEXT,\n    revoked_reason TEXT\n  , replaces TEXT)",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "name",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "public_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "last_seen_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "revoked_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "revoked_reason",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "replaces",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "ba_user",
                  "from": "user_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_devices_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_devices_user",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_devices_user ON v2_devices(user_id)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_directive_targets",
              "sql": "CREATE TABLE v2_directive_targets (\n    ws_id TEXT NOT NULL,\n    directive_id TEXT NOT NULL,\n    session_key TEXT NOT NULL,\n    PRIMARY KEY (directive_id, session_key),\n    UNIQUE (ws_id, directive_id, session_key),\n    FOREIGN KEY (ws_id, directive_id) REFERENCES v2_directives(ws_id, id) ON DELETE CASCADE,\n    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "directive_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_sessions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_sessions",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_directives",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_directives",
                  "from": "directive_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_directive_targets_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "directive_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_directive_targets_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "directive_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 2,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_directive_targets_key",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_directive_targets_key ON v2_directive_targets(ws_id, session_key)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_directives",
              "sql": "CREATE TABLE \"v2_directives\" (\n    seq INTEGER PRIMARY KEY AUTOINCREMENT,\n    id TEXT NOT NULL UNIQUE,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    kind TEXT NOT NULL CHECK (kind IN ('goal_version','binding_changed','binding_suspended','stop','resume','request','hold','release')),\n    goal_id TEXT,\n    goal_json TEXT,\n    binding_json TEXT,\n    created_at TEXT NOT NULL,\n    request_json TEXT,\n    hold_json TEXT,\n    UNIQUE (ws_id, id),\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "seq",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "kind",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "goal_json",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "binding_json",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "request_json",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "hold_json",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_directives_1",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_directives_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 2,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_epochs",
              "sql": "CREATE TABLE v2_epochs (\n    ws_id TEXT NOT NULL,\n    session_key TEXT NOT NULL,\n    epoch_id TEXT NOT NULL,\n    goal_id TEXT,\n    goal_version_at_start INTEGER,\n    starts_at TEXT NOT NULL,\n    ends_at TEXT,\n    root_turn TEXT,\n    cause TEXT NOT NULL,\n    authority TEXT NOT NULL CHECK (authority IN ('none','own','pod','alignment')),\n    alignment_id TEXT,\n    created_at TEXT NOT NULL,\n    PRIMARY KEY (ws_id, session_key, epoch_id),\n    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE,\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id),\n    FOREIGN KEY (ws_id, alignment_id) REFERENCES v2_alignments(ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "epoch_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "goal_version_at_start",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "starts_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "ends_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "root_turn",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "cause",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "authority",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "alignment_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_alignments",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_alignments",
                  "from": "alignment_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 2,
                  "seq": 0,
                  "table": "v2_sessions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 2,
                  "seq": 1,
                  "table": "v2_sessions",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_epochs_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 2,
                      "name": "epoch_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_epochs_open",
                  "unique": 1,
                  "origin": "c",
                  "partial": 1,
                  "sql": "CREATE UNIQUE INDEX v2_epochs_open ON v2_epochs(ws_id, session_key) WHERE ends_at IS NULL",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_events",
              "sql": "CREATE TABLE v2_events (\n    id INTEGER PRIMARY KEY,\n    name TEXT NOT NULL,\n    ws_id TEXT,\n    actor TEXT,\n    at TEXT NOT NULL,\n    props TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(props) AND json_type(props) = 'object')\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "name",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "actor",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "props",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'{}'",
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [],
              "indexes": [
                {
                  "seq": 2,
                  "name": "v2_events_actor",
                  "unique": 0,
                  "origin": "c",
                  "partial": 1,
                  "sql": "CREATE INDEX v2_events_actor ON v2_events(actor) WHERE actor IS NOT NULL",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 3,
                      "name": "actor",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 4,
                  "name": "v2_events_name_at",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_events_name_at ON v2_events(name, at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "name",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 4,
                      "name": "at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_events_once_person",
                  "unique": 1,
                  "origin": "c",
                  "partial": 1,
                  "sql": "CREATE UNIQUE INDEX v2_events_once_person ON v2_events(name, ws_id, actor)\n    WHERE ws_id IS NOT NULL AND actor IS NOT NULL AND name IN (\n    'member_first_session_captured', 'value_card_viewed', 'value_reported', 'follow_up_clicked')",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "name",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "actor",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_events_once_ws",
                  "unique": 1,
                  "origin": "c",
                  "partial": 1,
                  "sql": "CREATE UNIQUE INDEX v2_events_once_ws ON v2_events(name, ws_id) WHERE ws_id IS NOT NULL AND name IN (\n    'workspace_created', 'code_redeemed', 'first_session_captured', 'first_session_bound', 'second_member_joined',\n    'first_change_request', 'first_approval', 'first_directive', 'first_mcp_read', 'loi_sent', 'loi_signed',\n    'first_ask', 'first_limit', 'first_request', 'first_hold', 'first_launch')",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "name",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 3,
                  "name": "v2_events_ws",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_events_ws ON v2_events(ws_id, name)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 2,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "name",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": [
                {
                  "name": "v2_events_append_only",
                  "sql": "CREATE TRIGGER v2_events_append_only BEFORE UPDATE OF id, name, at, props ON v2_events\n    BEGIN SELECT RAISE(ABORT, 'v2_events is append-only'); END"
                }
              ]
            },
            {
              "name": "v2_former_members",
              "sql": "CREATE TABLE v2_former_members (\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    user_id TEXT,\n    n INTEGER,\n    removed_at TEXT NOT NULL,\n    pseudonymised_at TEXT\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "n",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "removed_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "pseudonymised_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "v2_former_members_n",
                  "unique": 1,
                  "origin": "c",
                  "partial": 1,
                  "sql": "CREATE UNIQUE INDEX v2_former_members_n ON v2_former_members(ws_id, n) WHERE n IS NOT NULL",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "n",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_former_members_pending",
                  "unique": 1,
                  "origin": "c",
                  "partial": 1,
                  "sql": "CREATE UNIQUE INDEX v2_former_members_pending ON v2_former_members(ws_id, user_id) WHERE user_id IS NOT NULL",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_goal_acks",
              "sql": "CREATE TABLE v2_goal_acks (\n    ws_id TEXT NOT NULL,\n    goal_id TEXT NOT NULL,\n    parent_id TEXT NOT NULL,\n    parent_version INTEGER NOT NULL,\n    at TEXT NOT NULL,\n    PRIMARY KEY (goal_id, parent_id),\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE,\n    FOREIGN KEY (ws_id, parent_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "parent_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "parent_version",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "parent_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_goal_acks_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "parent_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_goal_holds",
              "sql": "CREATE TABLE v2_goal_holds (\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    goal_id TEXT NOT NULL,\n    held_by TEXT NOT NULL,\n    reason TEXT CHECK (reason IS NULL OR length(reason) <= 280),\n    held_at TEXT NOT NULL,\n    directive_id TEXT,\n    PRIMARY KEY (ws_id, goal_id),\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "held_by",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "reason",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "held_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "directive_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_goal_holds_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_goal_versions",
              "sql": "CREATE TABLE v2_goal_versions (\n    ws_id TEXT NOT NULL,\n    goal_id TEXT NOT NULL,\n    version INTEGER NOT NULL,\n    title TEXT NOT NULL,\n    measures_json TEXT NOT NULL,\n    anchors_json TEXT NOT NULL,\n    status TEXT NOT NULL,\n    content_hash TEXT NOT NULL,\n    created_by TEXT NOT NULL,\n    created_at TEXT NOT NULL, depends_on_json TEXT NOT NULL DEFAULT '[]', limits_json TEXT NOT NULL DEFAULT '[]', target_share INTEGER CHECK (target_share IS NULL OR target_share BETWEEN 0 AND 100),\n    PRIMARY KEY (goal_id, version),\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "version",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "title",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "measures_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "anchors_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "status",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "content_hash",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "created_by",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "depends_on_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'[]'",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "limits_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'[]'",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "target_share",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_goal_versions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "version",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_goals",
              "sql": "CREATE TABLE \"v2_goals\" (\n    id TEXT PRIMARY KEY,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    owner_id TEXT NOT NULL,\n    pod_id TEXT,\n    visibility TEXT NOT NULL CHECK (visibility IN ('private','pod','workspace')),\n    version INTEGER NOT NULL,\n    title TEXT NOT NULL,\n    measures_json TEXT NOT NULL,\n    anchors_json TEXT NOT NULL,\n    status TEXT NOT NULL CHECK (status IN ('active','achieved','dropped')),\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    depends_on_json TEXT NOT NULL DEFAULT '[]',\n    level TEXT NOT NULL DEFAULT 'team' CHECK (level IN ('company','team')), limits_json TEXT NOT NULL DEFAULT '[]', target_share INTEGER CHECK (target_share IS NULL OR target_share BETWEEN 0 AND 100),\n    UNIQUE (ws_id, id),\n    CHECK (visibility <> 'pod' OR pod_id IS NOT NULL),\n    CHECK (level <> 'company' OR (pod_id IS NULL AND visibility = 'workspace')),\n    FOREIGN KEY (ws_id, pod_id) REFERENCES v2_pods(ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "owner_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "pod_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "visibility",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "version",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "title",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "measures_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "anchors_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "status",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "depends_on_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'[]'",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "level",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'team'",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 14,
                  "name": "limits_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'[]'",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 15,
                  "name": "target_share",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_pods",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_pods",
                  "from": "pod_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_goals_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_goals_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_goals_ws",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_goals_ws ON v2_goals(ws_id)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_invites",
              "sql": "CREATE TABLE v2_invites (\n    id TEXT PRIMARY KEY,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    token_hash TEXT NOT NULL UNIQUE,\n    email TEXT NOT NULL,\n    role TEXT NOT NULL CHECK (role IN ('owner','member','viewer')),\n    created_by TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    expires_at TEXT NOT NULL,\n    accepted_at TEXT,\n    accepted_by TEXT, team_id TEXT, team_role TEXT CHECK (team_role IN ('lead','member')),\n    UNIQUE (ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "token_hash",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "email",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "role",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "created_by",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "expires_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "accepted_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "accepted_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "team_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "team_role",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_invites_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_invites_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 2,
                      "name": "token_hash",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_invites_3",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_members",
              "sql": "CREATE TABLE v2_members (\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    user_id TEXT NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,\n    role TEXT NOT NULL CHECK (role IN ('owner','member','viewer')),\n    created_at TEXT NOT NULL,\n    PRIMARY KEY (ws_id, user_id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "role",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "ba_user",
                  "from": "user_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_members_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_members_user",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_members_user ON v2_members(user_id)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_oauth_goal_sends",
              "sql": "CREATE TABLE v2_oauth_goal_sends (\n    grant_id TEXT NOT NULL REFERENCES v2_oauth_grants(id) ON DELETE CASCADE,\n    ws_id TEXT NOT NULL,\n    goal_id TEXT NOT NULL,\n    version INTEGER NOT NULL,\n    sent_at TEXT NOT NULL,\n    PRIMARY KEY (grant_id, goal_id, version),\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "grant_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "version",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "sent_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_oauth_grants",
                  "from": "grant_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_oauth_goal_sends_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "grant_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "version",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_oauth_goal_sends_goal",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_oauth_goal_sends_goal ON v2_oauth_goal_sends(ws_id, goal_id, version)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "version",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_oauth_grants",
              "sql": "CREATE TABLE v2_oauth_grants (\n    id TEXT PRIMARY KEY,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    user_id TEXT NOT NULL,\n    client_id TEXT NOT NULL,\n    client_name TEXT NOT NULL,\n    redirect_host TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    last_used_at TEXT,\n    refresh_hash TEXT NOT NULL,\n    prev_refresh_hash TEXT,\n    refresh_exp INTEGER NOT NULL,\n    kid TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'goals:read', last_read_at TEXT,\n    FOREIGN KEY (ws_id, user_id) REFERENCES v2_members(ws_id, user_id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "client_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "client_name",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "redirect_host",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "last_used_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "refresh_hash",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "prev_refresh_hash",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "refresh_exp",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "kid",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "scope",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'goals:read'",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "last_read_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_members",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_members",
                  "from": "user_id",
                  "to": "user_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_oauth_grants_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_oauth_grants_member",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_oauth_grants_member ON v2_oauth_grants(ws_id, user_id, created_at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 6,
                      "name": "created_at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_passkey_prompt_dismissed",
              "sql": "CREATE TABLE v2_passkey_prompt_dismissed (\n    user_id TEXT PRIMARY KEY REFERENCES ba_user(id) ON DELETE CASCADE,\n    dismissed_at TEXT NOT NULL\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "dismissed_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "ba_user",
                  "from": "user_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_passkey_prompt_dismissed_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_passkey_use",
              "sql": "CREATE TABLE v2_passkey_use (\n    passkey_id TEXT PRIMARY KEY REFERENCES ba_passkey(id) ON DELETE CASCADE,\n    last_used_at TEXT NOT NULL\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "passkey_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "last_used_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "ba_passkey",
                  "from": "passkey_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_passkey_use_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "passkey_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_pod_members",
              "sql": "CREATE TABLE v2_pod_members (\n    ws_id TEXT NOT NULL,\n    pod_id TEXT NOT NULL,\n    user_id TEXT NOT NULL,\n    role TEXT NOT NULL CHECK (role IN ('lead','member')),\n    created_at TEXT NOT NULL,\n    PRIMARY KEY (pod_id, user_id),\n    FOREIGN KEY (ws_id, pod_id) REFERENCES v2_pods(ws_id, id) ON DELETE CASCADE,\n    FOREIGN KEY (ws_id, user_id) REFERENCES v2_members(ws_id, user_id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "pod_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "role",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_members",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_members",
                  "from": "user_id",
                  "to": "user_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_pods",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_pods",
                  "from": "pod_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_pod_members_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "pod_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_pods",
              "sql": "CREATE TABLE v2_pods (\n    id TEXT PRIMARY KEY,\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    name TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    UNIQUE (ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "name",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_pods_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_pods_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_rate_hits",
              "sql": "CREATE TABLE v2_rate_hits (\n    key TEXT NOT NULL,\n    at INTEGER NOT NULL\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "at",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [],
              "indexes": [
                {
                  "seq": 0,
                  "name": "v2_rate_hits_at",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_rate_hits_at ON v2_rate_hits(at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_rate_hits_key",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_rate_hits_key ON v2_rate_hits(key, at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_reallocation_approvals",
              "sql": "CREATE TABLE v2_reallocation_approvals (\n    ws_id TEXT NOT NULL,\n    reallocation_id TEXT NOT NULL,\n    revision INTEGER NOT NULL,\n    goal_id TEXT NOT NULL,\n    user_id TEXT NOT NULL,\n    at TEXT NOT NULL,\n    PRIMARY KEY (reallocation_id, revision, goal_id),\n    FOREIGN KEY (ws_id, reallocation_id) REFERENCES v2_reallocations(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "reallocation_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_reallocations",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_reallocations",
                  "from": "reallocation_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_reallocation_approvals_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "reallocation_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_reallocation_revisions",
              "sql": "CREATE TABLE v2_reallocation_revisions (\n    ws_id TEXT NOT NULL,\n    reallocation_id TEXT NOT NULL,\n    revision INTEGER NOT NULL,\n    targets_json TEXT NOT NULL,\n    note TEXT CHECK (note IS NULL OR length(note) <= 1000),\n    author_id TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    PRIMARY KEY (reallocation_id, revision),\n    FOREIGN KEY (ws_id, reallocation_id) REFERENCES v2_reallocations(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "reallocation_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "targets_json",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "note",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "author_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_reallocations",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_reallocations",
                  "from": "reallocation_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_reallocation_revisions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "reallocation_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "revision",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_reallocations",
              "sql": "CREATE TABLE v2_reallocations (\n    id TEXT PRIMARY KEY,                       -- rl_<24 base32>\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    requester_id TEXT NOT NULL,\n    state TEXT NOT NULL CHECK (state IN ('pending','countered','approved','rejected','withdrawn','superseded')),\n    revision INTEGER NOT NULL,\n    launch TEXT CHECK (launch IS NULL OR launch IN ('pending','not_yet','launched','superseded')),\n    launch_by TEXT,\n    launch_at TEXT,\n    decided_by TEXT,\n    decision_note TEXT,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    decided_at TEXT,\n    UNIQUE (ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "requester_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "revision",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "launch",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "launch_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "launch_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "decided_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "decision_note",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "decided_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_reallocations_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_reallocations_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_reallocations_ws",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_reallocations_ws ON v2_reallocations(ws_id, updated_at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 11,
                      "name": "updated_at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_receipts",
              "sql": "CREATE TABLE \"v2_receipts\" (\n    ws_id TEXT NOT NULL,\n    directive_id TEXT NOT NULL,\n    session_key TEXT NOT NULL,\n    state TEXT NOT NULL CHECK (state IN ('received','applied','enforced','accepted','declined')),\n    at TEXT NOT NULL,\n    recorded_at TEXT NOT NULL,\n    auto_accepted INTEGER NOT NULL DEFAULT 0 CHECK (auto_accepted IN (0, 1) AND (auto_accepted = 0 OR state = 'accepted')),\n    PRIMARY KEY (directive_id, session_key, state, auto_accepted),\n    FOREIGN KEY (ws_id, directive_id, session_key) REFERENCES v2_directive_targets(ws_id, directive_id, session_key) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "directive_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "recorded_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "auto_accepted",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": "0",
                  "pk": 4,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_directive_targets",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_directive_targets",
                  "from": "directive_id",
                  "to": "directive_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 2,
                  "table": "v2_directive_targets",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_receipts_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "directive_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "state",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": 6,
                      "name": "auto_accepted",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 4,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_request_targets",
              "sql": "CREATE TABLE v2_request_targets (\n    ws_id TEXT NOT NULL,\n    request_id TEXT NOT NULL,\n    session_key TEXT NOT NULL,\n    state TEXT NOT NULL CHECK (state IN ('sent','received','accepted','declined','expired')),\n    auto_accepted INTEGER NOT NULL DEFAULT 0 CHECK (auto_accepted IN (0, 1)),\n    updated_at TEXT NOT NULL, ended_reason TEXT CHECK (ended_reason IS NULL OR ended_reason IN ('device_signed_out','member_removed')),\n    PRIMARY KEY (request_id, session_key),\n    FOREIGN KEY (ws_id, request_id) REFERENCES v2_requests(ws_id, id) ON DELETE CASCADE,\n    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "request_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "auto_accepted",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": "0",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "ended_reason",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_sessions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_sessions",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_requests",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_requests",
                  "from": "request_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_request_targets_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "request_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_request_targets_key",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_request_targets_key ON v2_request_targets(ws_id, session_key)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_requests",
              "sql": "CREATE TABLE v2_requests (\n    id TEXT PRIMARY KEY,                       -- rq_<24 base32>\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    goal_id TEXT NOT NULL,\n    type TEXT NOT NULL CHECK (type IN ('replan','checkpoint','switch_goal')),\n    target_goal_id TEXT,                       -- switch_goal only\n    goal_version INTEGER NOT NULL,\n    note TEXT CHECK (note IS NULL OR length(note) <= 280),\n    sender_id TEXT NOT NULL,\n    sender_role TEXT NOT NULL CHECK (sender_role IN ('approver','owner')),\n    directive_id TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    cancelled_at TEXT,\n    cancelled_by TEXT,\n    UNIQUE (ws_id, id),\n    CHECK ((type = 'switch_goal') = (target_goal_id IS NOT NULL)),\n    FOREIGN KEY (ws_id, goal_id) REFERENCES v2_goals(ws_id, id),\n    FOREIGN KEY (ws_id, target_goal_id) REFERENCES v2_goals(ws_id, id),\n    FOREIGN KEY (ws_id, directive_id) REFERENCES v2_directives(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "type",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "target_goal_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "goal_version",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "note",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "sender_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "sender_role",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "directive_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "cancelled_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "cancelled_by",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_directives",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_directives",
                  "from": "directive_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "target_goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 2,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 2,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 3,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 3,
                  "name": "sqlite_autoindex_v2_requests_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_requests_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_requests_goal",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_requests_goal ON v2_requests(ws_id, goal_id, created_at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 10,
                      "name": "created_at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_requests_sender",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_requests_sender ON v2_requests(sender_id, created_at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 7,
                      "name": "sender_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 10,
                      "name": "created_at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_sessions",
              "sql": "CREATE TABLE \"v2_sessions\" (\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    session_key TEXT NOT NULL,\n    user_id TEXT NOT NULL,\n    device_id TEXT REFERENCES v2_devices(id) ON DELETE SET NULL,\n    harness TEXT NOT NULL CHECK (harness IN ('claude-code','codex')),\n    repo_key TEXT NOT NULL,\n    repo_alias TEXT,\n    title TEXT,\n    started_at TEXT NOT NULL,\n    state TEXT NOT NULL CHECK (state IN ('shared','suspended','stopped')),\n    stopped_at TEXT,\n    governing_goal_id TEXT,\n    governing_alignment_id TEXT,\n    agent_stopped INTEGER NOT NULL DEFAULT 0,\n    conflicts INTEGER NOT NULL DEFAULT 0,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    ended_reason TEXT CHECK (ended_reason IS NULL OR ended_reason IN ('device_signed_out','member_removed')),\n    PRIMARY KEY (ws_id, session_key),\n    FOREIGN KEY (ws_id, governing_goal_id) REFERENCES v2_goals(ws_id, id),\n    FOREIGN KEY (ws_id, governing_alignment_id) REFERENCES v2_alignments(ws_id, id)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "user_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "device_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "harness",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "repo_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "repo_alias",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "title",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "started_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "state",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "stopped_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "governing_goal_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "governing_alignment_id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "agent_stopped",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": "0",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 14,
                  "name": "conflicts",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": "0",
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 15,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 16,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 17,
                  "name": "ended_reason",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_alignments",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_alignments",
                  "from": "governing_alignment_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_goals",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 1,
                  "table": "v2_goals",
                  "from": "governing_goal_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "NO ACTION",
                  "match": "NONE"
                },
                {
                  "id": 2,
                  "seq": 0,
                  "table": "v2_devices",
                  "from": "device_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "SET NULL",
                  "match": "NONE"
                },
                {
                  "id": 3,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 2,
                  "name": "sqlite_autoindex_v2_sessions_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 1,
                  "name": "v2_sessions_device",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_sessions_device ON v2_sessions(device_id)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 3,
                      "name": "device_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_sessions_user",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_sessions_user ON v2_sessions(ws_id, user_id)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "user_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_spend_rollups",
              "sql": "CREATE TABLE v2_spend_rollups (\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    goal_id TEXT NOT NULL,\n    day TEXT NOT NULL,\n    model TEXT NOT NULL,\n    basis TEXT NOT NULL,\n    requests INTEGER NOT NULL,\n    input INTEGER NOT NULL,\n    output INTEGER NOT NULL,\n    cache_read INTEGER NOT NULL,\n    cache_write_5m INTEGER NOT NULL,\n    cache_write_1h INTEGER NOT NULL,\n    cache_write_unsplit INTEGER NOT NULL,\n    est_list_usd_micros INTEGER NOT NULL,\n    unpriced_requests INTEGER NOT NULL,\n    PRIMARY KEY (ws_id, goal_id, day, model, basis)\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "day",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "model",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 4,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "basis",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 5,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "requests",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "input",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "output",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "cache_read",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "cache_write_5m",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "cache_write_1h",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "cache_write_unsplit",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "est_list_usd_micros",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "unpriced_requests",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_spend_rollups_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "goal_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 2,
                      "name": "day",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": 3,
                      "name": "model",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 4,
                      "cid": 4,
                      "name": "basis",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 5,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_steering_events",
              "sql": "CREATE TABLE v2_steering_events (\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    session_key TEXT NOT NULL,\n    goal_id TEXT NOT NULL,\n    suggested_goal_id TEXT NOT NULL,\n    share INTEGER NOT NULL CHECK (share BETWEEN 0 AND 100),\n    target INTEGER NOT NULL CHECK (target BETWEEN 0 AND 100),\n    at TEXT NOT NULL,\n    recorded_at TEXT NOT NULL,\n    PRIMARY KEY (ws_id, session_key, at),\n    FOREIGN KEY (ws_id, session_key) REFERENCES v2_sessions(ws_id, session_key) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "suggested_goal_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "share",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "target",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "recorded_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_sessions",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_sessions",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_steering_events_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 6,
                      "name": "at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_steering_events_at",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_steering_events_at ON v2_steering_events(ws_id, at)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 6,
                      "name": "at",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_usage",
              "sql": "CREATE TABLE v2_usage (\n    ws_id TEXT NOT NULL,\n    session_key TEXT NOT NULL,\n    request_key TEXT NOT NULL,\n    epoch_id TEXT NOT NULL,\n    ts TEXT NOT NULL,\n    model TEXT NOT NULL,\n    query_source TEXT NOT NULL,\n    input INTEGER NOT NULL,\n    output INTEGER NOT NULL,\n    cache_read INTEGER NOT NULL,\n    cache_write_5m INTEGER NOT NULL,\n    cache_write_1h INTEGER NOT NULL,\n    cache_write_unsplit INTEGER NOT NULL,\n    basis TEXT NOT NULL,\n    est_list_usd_micros INTEGER,\n    price_table_version TEXT,\n    source TEXT NOT NULL,\n    received_at TEXT NOT NULL,\n    PRIMARY KEY (ws_id, session_key, request_key),\n    FOREIGN KEY (ws_id, session_key, epoch_id) REFERENCES v2_epochs(ws_id, session_key, epoch_id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "session_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 2,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "request_key",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 3,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "epoch_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "ts",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "model",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "query_source",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "input",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 8,
                  "name": "output",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 9,
                  "name": "cache_read",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 10,
                  "name": "cache_write_5m",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 11,
                  "name": "cache_write_1h",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 12,
                  "name": "cache_write_unsplit",
                  "type": "INTEGER",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 13,
                  "name": "basis",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 14,
                  "name": "est_list_usd_micros",
                  "type": "INTEGER",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 15,
                  "name": "price_table_version",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 16,
                  "name": "source",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 17,
                  "name": "received_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_epochs",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_epochs",
                  "from": "session_key",
                  "to": "session_key",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 2,
                  "table": "v2_epochs",
                  "from": "epoch_id",
                  "to": "epoch_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_usage_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 1,
                      "name": "session_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 2,
                      "name": "request_key",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "v2_usage_ws_ts",
                  "unique": 0,
                  "origin": "c",
                  "partial": 0,
                  "sql": "CREATE INDEX v2_usage_ws_ts ON v2_usage(ws_id, ts)",
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 4,
                      "name": "ts",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_value_reports",
              "sql": "CREATE TABLE v2_value_reports (\n    id TEXT PRIMARY KEY,                       -- vr_<24 base32>\n    ws_id TEXT NOT NULL REFERENCES v2_workspaces(id) ON DELETE CASCADE,\n    change_request_id TEXT NOT NULL,\n    person_id TEXT NOT NULL,\n    estimate TEXT NOT NULL CHECK (estimate IN ('same_day','two_to_three_days','about_a_week','longer','would_not_be_decided')),\n    note TEXT CHECK (note IS NULL OR length(note) <= 500),\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    UNIQUE (ws_id, change_request_id, person_id),\n    FOREIGN KEY (ws_id, change_request_id) REFERENCES v2_change_requests(ws_id, id) ON DELETE CASCADE\n  )",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "ws_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "change_request_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "person_id",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "estimate",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "note",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 6,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 7,
                  "name": "updated_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [
                {
                  "id": 0,
                  "seq": 0,
                  "table": "v2_change_requests",
                  "from": "ws_id",
                  "to": "ws_id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 0,
                  "seq": 1,
                  "table": "v2_change_requests",
                  "from": "change_request_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                },
                {
                  "id": 1,
                  "seq": 0,
                  "table": "v2_workspaces",
                  "from": "ws_id",
                  "to": "id",
                  "on_update": "NO ACTION",
                  "on_delete": "CASCADE",
                  "match": "NONE"
                }
              ],
              "indexes": [
                {
                  "seq": 1,
                  "name": "sqlite_autoindex_v2_value_reports_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                },
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_value_reports_2",
                  "unique": 1,
                  "origin": "u",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 1,
                      "name": "ws_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": 2,
                      "name": "change_request_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 2,
                      "cid": 3,
                      "name": "person_id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 3,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            },
            {
              "name": "v2_workspaces",
              "sql": "CREATE TABLE v2_workspaces (\n    id TEXT PRIMARY KEY,\n    name TEXT NOT NULL,\n    created_by TEXT NOT NULL,\n    created_at TEXT NOT NULL\n  , deleted_at TEXT, steering TEXT NOT NULL DEFAULT 'off' CHECK (steering IN ('off','on')))",
              "columns": [
                {
                  "cid": 0,
                  "name": "id",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 1,
                  "hidden": 0
                },
                {
                  "cid": 1,
                  "name": "name",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 2,
                  "name": "created_by",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 3,
                  "name": "created_at",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 4,
                  "name": "deleted_at",
                  "type": "TEXT",
                  "notnull": 0,
                  "dflt_value": null,
                  "pk": 0,
                  "hidden": 0
                },
                {
                  "cid": 5,
                  "name": "steering",
                  "type": "TEXT",
                  "notnull": 1,
                  "dflt_value": "'off'",
                  "pk": 0,
                  "hidden": 0
                }
              ],
              "foreign_keys": [],
              "indexes": [
                {
                  "seq": 0,
                  "name": "sqlite_autoindex_v2_workspaces_1",
                  "unique": 1,
                  "origin": "pk",
                  "partial": 0,
                  "sql": null,
                  "columns": [
                    {
                      "seqno": 0,
                      "cid": 0,
                      "name": "id",
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 1
                    },
                    {
                      "seqno": 1,
                      "cid": -1,
                      "name": null,
                      "desc": 0,
                      "coll": "BINARY",
                      "key": 0
                    }
                  ]
                }
              ],
              "triggers": []
            }
          ],
          "foreign_key_violations": [],
          "identity": "sha256:da3d5c34300aa32a410ace14869321924b7813bc0fc124adf5901bc23dc4911b"
        }
      },
      "original_inventory_sha256": "499e43291f4f54f8a7b7710810ae9b14f885b33e1daaf71dd7428a2f3bda26f8",
      "baseline_only_not_generation_input": true
    },
    "constants": {
      "RESTORE_DAYS": 30,
      "FORMER_MEMBER_DAYS": 30,
      "SESSION_MONTHS": 13,
      "AUDIT_MONTHS": 12,
      "INVITE_GRACE_DAYS": 7,
      "ACCESS_REQUEST_MONTHS": 13,
      "EVENT_MONTHS": 13,
      "CLOSED_ASK_MONTHS": 13,
      "VALUE_REPORT_MONTHS": 13,
      "REQUEST_MONTHS": 13,
      "DELETED_SESSION_MONTHS": 13,
      "RETENTION_INTERVAL_MS": 86400000,
      "PERSON_COLUMNS": [
        [
          "v2_invites",
          "created_by"
        ],
        [
          "v2_goals",
          "owner_id"
        ],
        [
          "v2_goal_versions",
          "created_by"
        ],
        [
          "v2_audit",
          "actor_id"
        ],
        [
          "v2_audit",
          "object_id"
        ],
        [
          "v2_alignments",
          "requester_id"
        ],
        [
          "v2_alignments",
          "revoked_by"
        ],
        [
          "v2_alignment_revisions",
          "author_id"
        ],
        [
          "v2_alignment_approvals",
          "user_id"
        ],
        [
          "v2_sessions",
          "user_id"
        ],
        [
          "v2_activity",
          "user_id"
        ],
        [
          "v2_change_requests",
          "requester_id"
        ],
        [
          "v2_change_requests",
          "approved_by"
        ],
        [
          "v2_change_requests",
          "rejected_by"
        ],
        [
          "v2_change_requests",
          "launch_by"
        ],
        [
          "v2_change_request_revisions",
          "author_id"
        ],
        [
          "v2_change_request_revisions",
          "acknowledged_by"
        ],
        [
          "v2_change_request_evidence",
          "added_by"
        ],
        [
          "v2_asks",
          "created_by"
        ],
        [
          "v2_asks",
          "decided_by"
        ],
        [
          "v2_ask_mentions",
          "added_by"
        ],
        [
          "v2_value_reports",
          "person_id"
        ],
        [
          "v2_requests",
          "sender_id"
        ],
        [
          "v2_requests",
          "cancelled_by"
        ],
        [
          "v2_goal_holds",
          "held_by"
        ],
        [
          "v2_reallocations",
          "requester_id"
        ],
        [
          "v2_reallocations",
          "launch_by"
        ],
        [
          "v2_reallocations",
          "decided_by"
        ],
        [
          "v2_reallocation_revisions",
          "author_id"
        ],
        [
          "v2_reallocation_approvals",
          "user_id"
        ]
      ]
    },
    "personColumns": [
      [
        "v2_invites",
        "created_by"
      ],
      [
        "v2_goals",
        "owner_id"
      ],
      [
        "v2_goal_versions",
        "created_by"
      ],
      [
        "v2_audit",
        "actor_id"
      ],
      [
        "v2_audit",
        "object_id"
      ],
      [
        "v2_alignments",
        "requester_id"
      ],
      [
        "v2_alignments",
        "revoked_by"
      ],
      [
        "v2_alignment_revisions",
        "author_id"
      ],
      [
        "v2_alignment_approvals",
        "user_id"
      ],
      [
        "v2_sessions",
        "user_id"
      ],
      [
        "v2_activity",
        "user_id"
      ],
      [
        "v2_change_requests",
        "requester_id"
      ],
      [
        "v2_change_requests",
        "approved_by"
      ],
      [
        "v2_change_requests",
        "rejected_by"
      ],
      [
        "v2_change_requests",
        "launch_by"
      ],
      [
        "v2_change_request_revisions",
        "author_id"
      ],
      [
        "v2_change_request_revisions",
        "acknowledged_by"
      ],
      [
        "v2_change_request_evidence",
        "added_by"
      ],
      [
        "v2_asks",
        "created_by"
      ],
      [
        "v2_asks",
        "decided_by"
      ],
      [
        "v2_ask_mentions",
        "added_by"
      ],
      [
        "v2_value_reports",
        "person_id"
      ],
      [
        "v2_requests",
        "sender_id"
      ],
      [
        "v2_requests",
        "cancelled_by"
      ],
      [
        "v2_goal_holds",
        "held_by"
      ],
      [
        "v2_reallocations",
        "requester_id"
      ],
      [
        "v2_reallocations",
        "launch_by"
      ],
      [
        "v2_reallocations",
        "decided_by"
      ],
      [
        "v2_reallocation_revisions",
        "author_id"
      ],
      [
        "v2_reallocation_approvals",
        "user_id"
      ]
    ],
    "baseline_only_not_generation_input": true
  },
  "/__private__/server-retention/runner-characterization.json": {
    "batches": [
      {
        "batch": 0,
        "records": 216,
        "sha256": "dcf76c388229f363b0ce94d02fd4bd79e5af0e4aae661915078f5ab3b2fcad1a"
      },
      {
        "batch": 1,
        "records": 145,
        "sha256": "761ee259bdaa1648c227df6633b240aa5facc88c60f3ef622c728934c8134c98"
      },
      {
        "batch": 2,
        "records": 57,
        "sha256": "011405cbeea126c33cd5ffd72b0787bfc82fb490d0a18480a9cbbbf416c53140"
      }
    ],
    "fault_paths": [
      {
        "settings": {},
        "reads": 20,
        "effects": 5,
        "captures": 5
      },
      {
        "settings": {
          "positiveKey": "events_deleted"
        },
        "reads": 21,
        "effects": 8,
        "captures": 5
      },
      {
        "settings": {
          "hosted": true,
          "rejectRun": true
        },
        "reads": 5,
        "effects": 7,
        "captures": 5
      },
      {
        "settings": {
          "hosted": false,
          "rejectRun": true
        },
        "reads": 5,
        "effects": 7,
        "captures": 5
      },
      {
        "settings": {
          "existingTimer": true,
          "positiveKey": "workspaces_purged"
        },
        "reads": 18,
        "effects": 5,
        "captures": 5
      },
      {
        "settings": {
          "deferred": true,
          "calls": 2,
          "positiveKey": "events_deleted"
        },
        "reads": 39,
        "effects": 13,
        "captures": 5
      },
      {
        "settings": {
          "concurrent": true,
          "deferred": true,
          "calls": 2
        },
        "reads": 37,
        "effects": 7,
        "captures": 5
      }
    ]
  }
};
const fileNames = {
  "core-characterization.json": "/__private__/server-retention/core-characterization.json",
  "native-runner-characterization.json": "/__private__/server-retention/native-runner-characterization.json",
  "retention-private-data-v1.json": "/__private__/server-retention/retention-private-data-v1.json",
  "retention-private-storage-seed-v1.cjs": "/__private__/server-retention/retention-private-storage-seed-v1.cjs",
  "runner-characterization.json": "/__private__/server-retention/runner-characterization.json",
  "server-retention-core-cases-draft-v1.cjs": "/__private__/server-retention/server-retention-core-cases-draft-v1.cjs",
  "server-retention-core-fixture-draft-v1.cjs": "/__private__/server-retention/server-retention-core-fixture-draft-v1.cjs",
  "server-retention-runner-fixture-draft-v2.cjs": "/__private__/server-retention/server-retention-runner-fixture-draft-v2.cjs",
  "server-retention-runner-fixture-draft-v4.cjs": "/__private__/server-retention/server-retention-runner-fixture-draft-v4.cjs"
};
const manifest = {
  "schema": "align/readable-private-qualification@1",
  "component": "server-retention",
  "package": "server_retention",
  "package_files": [
    "package.json",
    "create_retention.js",
    "create_retention_runner.js"
  ],
  "package_exports": {
    "./create_retention": "./create_retention.js",
    "./create_retention_runner": "./create_retention_runner.js"
  },
  "capabilities": [
    {
      "id": "server-retention.create-retention",
      "symbol": "create_retention",
      "module": "create_retention.js",
      "fixture": "server-retention-core-fixture-draft-v1.cjs",
      "cases": "server-retention-core-cases-draft-v1.cjs",
      "characterization": "core-characterization.json",
      "resource_count": 7,
      "default_operation": "run",
      "runner": false
    },
    {
      "id": "server-retention.create-retention-runner",
      "symbol": "create_retention_runner",
      "module": "create_retention_runner.js",
      "fixture": "server-retention-runner-fixture-draft-v4.cjs",
      "characterization": "runner-characterization.json",
      "resource_count": 5,
      "default_operation": null,
      "runner": true
    }
  ],
  "plans": [
    {
      "capability": "server-retention.create-retention",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 16,
        "sha256": "e82b80fb371cfc5164881cc35dbd2d436dc4b8341a42923c087543c04f1f1309"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 1,
      "expected_result": {
        "batch": 1,
        "records": 42,
        "sha256": "6e93a707e3515bad6bad932be523525188d33fd5f7df7904a4377bfb0d71f2fd"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 2,
      "expected_result": {
        "batch": 2,
        "records": 108,
        "sha256": "b7f1194aef5e1ad7dec468741a459163113700ab5540e98334a24979cb2fbff4"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 3,
      "expected_result": {
        "batch": 3,
        "records": 58,
        "sha256": "fbef32148c571ee8fd291ce79c6df63d1be0c15cbe8f666fce21451245fb9035"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 4,
      "expected_result": {
        "batch": 4,
        "records": 24,
        "sha256": "d6eb615de21ff1c6ca15bbe052d6c53927f9f8556b083b0097f2143fd1302044"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 5,
      "expected_result": {
        "batch": 5,
        "records": 48,
        "sha256": "3dc267976810394121bd7a223235de7b423dcfae65f73ec8f82d58de69ff028e"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 6,
      "expected_result": {
        "batch": 6,
        "records": 38,
        "sha256": "550c21d94c5424f3a915e1a66d1d288ca53a526263f3e4fd7d2a8ce8fa898d3f"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 7,
      "expected_result": {
        "batch": 7,
        "records": 137,
        "sha256": "6d5c6ebd1d012f2f8581a30eced2bc49b9da31dc05910f30994a02df69b63368"
      }
    },
    {
      "capability": "server-retention.create-retention",
      "batch": 8,
      "expected_result": {
        "batch": 8,
        "records": 256,
        "sha256": "f9e67db5a0ed67ce2100e7fc3ac6d4182a66c8148288f020c3b83d0de17a69d0"
      }
    },
    {
      "capability": "server-retention.create-retention-runner",
      "batch": 0,
      "expected_result": {
        "batch": 0,
        "records": 216,
        "sha256": "dcf76c388229f363b0ce94d02fd4bd79e5af0e4aae661915078f5ab3b2fcad1a"
      }
    },
    {
      "capability": "server-retention.create-retention-runner",
      "batch": 1,
      "expected_result": {
        "batch": 1,
        "records": 145,
        "sha256": "761ee259bdaa1648c227df6633b240aa5facc88c60f3ef622c728934c8134c98"
      }
    },
    {
      "capability": "server-retention.create-retention-runner",
      "batch": 2,
      "expected_result": {
        "batch": 2,
        "records": 57,
        "sha256": "011405cbeea126c33cd5ffd72b0787bfc82fb490d0a18480a9cbbbf416c53140"
      }
    }
  ],
  "files": [
    {
      "name": "core-characterization.json",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/core-characterization.json",
      "sha256": "edfa868e64555394e4602866baaae8ee8de46e184f98178e3f06bd17041172ba",
      "size": 2556
    },
    {
      "name": "native-runner-characterization.json",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/native-runner-characterization.json",
      "sha256": "996e61e4da0637c7d261a931b79f77c236efd0f563c6ed97d3d159a8c3f814c9",
      "size": 1525
    },
    {
      "name": "retention-private-data-v1.json",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/retention-private-data-v1.json",
      "sha256": "9f6f2aaa661ab2da51468522968bc56a0d78bc184423ed2705ea1cce687ada78",
      "size": 274737
    },
    {
      "name": "retention-private-storage-seed-v1.cjs",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/retention-private-storage-seed-v1.cjs",
      "sha256": "4706e4aae1658e63abecc854b804fb8e0375d0226fa9ec9ddd210e595c65f0a1",
      "size": 13665
    },
    {
      "name": "runner-characterization.json",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/runner-characterization.json",
      "sha256": "7ebacd9f3aa39d4649ba448d03a28bc292817bd69201b64cf1ba2257d7dcd07a",
      "size": 1525
    },
    {
      "name": "server-retention-core-cases-draft-v1.cjs",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/server-retention-core-cases-draft-v1.cjs",
      "sha256": "fc00ead144d879082ab31a5159eb792874d05a9ecb8929325e8c67bb17830282",
      "size": 3478
    },
    {
      "name": "server-retention-core-fixture-draft-v1.cjs",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/server-retention-core-fixture-draft-v1.cjs",
      "sha256": "c24d7e32ff60054466da29897e155e59fdd3aaf56f336249b72a4f7decd5c85d",
      "size": 15373
    },
    {
      "name": "server-retention-runner-fixture-draft-v2.cjs",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/server-retention-runner-fixture-draft-v2.cjs",
      "sha256": "691d07869614994f98811f561e5f9cd068595fa85e53866ad321bf7ff27d4670",
      "size": 8316
    },
    {
      "name": "server-retention-runner-fixture-draft-v4.cjs",
      "path": "tools/native-rewrite/qualification/metrics-retention-v1/server-retention/server-retention-runner-fixture-draft-v4.cjs",
      "sha256": "7d987421d0f4f15b45af7e760a8cf8d807d1cd4b75b36b5338051d37afa8cc92",
      "size": 8589
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
const driver = load("/__private__/server-retention/driver.cjs");

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
